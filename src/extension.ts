import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileExplorerProvider } from './fileExplorer';
import { ConfigManager } from './config';
import { copyRecursive } from './utils';

export function activate(context: vscode.ExtensionContext) {
  const configManager = new ConfigManager(context);
  const fileExplorerProvider = new FileExplorerProvider(configManager, context.extensionPath);

  const txTreeView = vscode.window.createTreeView('txTreeView', {
    treeDataProvider: fileExplorerProvider
  });

  txTreeView.onDidChangeVisibility(e => {
    vscode.commands.executeCommand("setContext", "txTreeViewFocus", e.visible);
    if (e.visible) {
      vscode.commands.executeCommand("workbench.view.extension.txTree");
    }
  });

  // Actualiza el contexto "viewItem" según el nodo seleccionado
  txTreeView.onDidChangeSelection(e => {
    if(e.selection && e.selection.length > 0) {
      vscode.commands.executeCommand("setContext", "viewItem", e.selection[0].contextValue);
    } else {
      vscode.commands.executeCommand("setContext", "viewItem", undefined);
    }
  });

  let clipboardPath: string | undefined;
  let clipboardIsCut: boolean = false;
  let lastClicked: { path: string; time: number } | undefined;
  const doubleClickThreshold = 300; // milisegundos

  context.subscriptions.push(
    vscode.commands.registerCommand('txTree.addFolder', async () => {
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Add Folder'
      });
      if (folderUri && folderUri[0]) {
        configManager.addFolder(folderUri[0].fsPath);
        fileExplorerProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('txTree.unlinkFolder', (node: any) => {
      if (node && node.path) {
        configManager.removeFolder(node.path);
        fileExplorerProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('txTree.copyFile', (node: any) => {
      if (node && node.path) {
        clipboardPath = node.path;
        clipboardIsCut = false;
        vscode.commands.executeCommand('setContext', 'fileClipboard', true);
        vscode.window.showInformationMessage(`Copied "${node.label}"`);
      }
    }),
    vscode.commands.registerCommand('txTree.cut', (node: any) => {
      if (node && node.path) {
        clipboardPath = node.path;
        clipboardIsCut = true;
        vscode.commands.executeCommand('setContext', 'fileClipboard', true);
        vscode.window.showInformationMessage(`Cut "${node.label}"`);
      }
    }),
    vscode.commands.registerCommand('txTree.pasteFile', async (node: any) => {
      if (clipboardPath && node && node.path) {
        const originalName = path.basename(clipboardPath);
        let destPath = path.join(node.path, originalName);
        let isDirectory = false;
        try {
          isDirectory = fs.lstatSync(clipboardPath).isDirectory();
        } catch (e) {}

        // Si ya existe, genera un nuevo nombre añadiendo _copy, _copy2, etc.
        let counter = 0;
        let newName = originalName;
        while (fs.existsSync(path.join(node.path, newName))) {
          counter++;
          if (isDirectory) {
            newName = originalName + (counter === 1 ? "_copy" : "_copy" + counter);
          } else {
            const ext = path.extname(originalName);
            const base = path.basename(originalName, ext);
            newName = base + (counter === 1 ? "_copy" : "_copy" + counter) + ext;
          }
        }
        destPath = path.join(node.path, newName);

        try {
          if (isDirectory) {
            const relative = path.relative(clipboardPath, destPath);
            if (!relative.startsWith('..') || relative === '') {
              vscode.window.showErrorMessage('No se puede pegar una carpeta dentro de sí misma o en una subcarpeta de ella.');
              return;
            }
          }
        } catch (e) {}

        try {
          if (clipboardIsCut) {
            // Mover (cut + paste)
            await new Promise<void>((resolve, reject) => {
              fs.rename(clipboardPath!, destPath, (err) => {
                if (err) { reject(err); } else { resolve(); }
              });
            });
            vscode.window.showInformationMessage(`Moved "${newName}" into "${node.label}"`);
          } else {
            // Copiar
            await copyRecursive(clipboardPath, destPath);
            vscode.window.showInformationMessage(`Pasted "${newName}" into "${node.label}"`);
          }
          clipboardPath = undefined;
          clipboardIsCut = false;
          vscode.commands.executeCommand('setContext', 'fileClipboard', false);
          fileExplorerProvider.refresh();
        } catch (err: any) {
          vscode.window.showErrorMessage(`Paste failed: ${err.message}`);
        }
      }
    }),
    vscode.commands.registerCommand('txTree.openInExplorer', (node: any) => {
      if (node && node.path) {
        try {
          const stats = fs.lstatSync(node.path);
          const fileUri = vscode.Uri.file(node.path);
          if (stats.isDirectory()) {
            // Si es una carpeta, se abre mostrando su contenido
            vscode.env.openExternal(fileUri);
          } else {
            // Si es un fichero, se revela el fichero con foco
            vscode.commands.executeCommand('revealFileInOS', fileUri);
          }
        } catch (e) {
          vscode.window.showErrorMessage("Error al abrir en el explorador: " + e);
        }
      }
    }),
    vscode.commands.registerCommand('txTree.openFile', (node: any) => {
      if (node && node.path) {
        const now = Date.now();
        if (lastClicked && lastClicked.path === node.path && (now - lastClicked.time) < doubleClickThreshold) {
          vscode.window.showTextDocument(vscode.Uri.file(node.path), { preview: false, preserveFocus: true });
        } else {
          vscode.window.showTextDocument(vscode.Uri.file(node.path), { preview: true, preserveFocus: true });
        }
        lastClicked = { path: node.path, time: now };
      }
    }),
    vscode.commands.registerCommand('txTree.createFile', async (node: any) => {
      let targetDir: string;
      if (node && node.path) {
        try {
          if (fs.lstatSync(node.path).isDirectory()) {
            targetDir = node.path;
          } else {
            targetDir = path.dirname(node.path);
          }
        } catch (err) {
          targetDir = path.dirname(node.path);
        }
      } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      } else {
        vscode.window.showErrorMessage("No se ha seleccionado una carpeta y no hay un workspace abierto.");
        return;
      }
      const fileName = await vscode.window.showInputBox({ prompt: "Nombre del nuevo fichero" });
      if (!fileName) { return; }
      const targetPath = path.join(targetDir, fileName);
      if (fs.existsSync(targetPath)) {
        vscode.window.showErrorMessage("El fichero ya existe.");
        return;
      }
      fs.writeFileSync(targetPath, '');
      vscode.window.showInformationMessage(`Fichero creado: ${targetPath}`);
      fileExplorerProvider.refresh();
    }),
    vscode.commands.registerCommand('txTree.createFolder', async (node: any) => {
      let targetDir: string;
      if (node && node.path) {
        try {
          if (fs.lstatSync(node.path).isDirectory()) {
            targetDir = node.path;
          } else {
            targetDir = path.dirname(node.path);
          }
        } catch (err) {
          targetDir = path.dirname(node.path);
        }
      } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      } else {
        vscode.window.showErrorMessage("No se ha seleccionado una carpeta y no hay un workspace abierto.");
        return;
      }
      const folderName = await vscode.window.showInputBox({ prompt: "Nombre de la nueva carpeta" });
      if (!folderName) { return; }
      const targetPath = path.join(targetDir, folderName);
      if (fs.existsSync(targetPath)) {
        vscode.window.showErrorMessage("La carpeta ya existe.");
        return;
      }
      fs.mkdirSync(targetPath);
      vscode.window.showInformationMessage(`Carpeta creada: ${targetPath}`);
      fileExplorerProvider.refresh();
    }),
    vscode.commands.registerCommand('txTree.rename', async (node: any) => {
      if (node && node.path) {
        const oldPath = node.path;
        const oldName = path.basename(oldPath);
        const newName = await vscode.window.showInputBox({ prompt: "Nuevo nombre", value: oldName });
        if (!newName || newName === oldName) { return; }
        const newPath = path.join(path.dirname(oldPath), newName);
        if (fs.existsSync(newPath)) {
          vscode.window.showErrorMessage("Ya existe un elemento con ese nombre.");
          return;
        }
        try {
          fs.renameSync(oldPath, newPath);
          vscode.window.showInformationMessage(`Renombrado a "${newName}"`);
          fileExplorerProvider.refresh();
        } catch (err: any) {
          vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
        }
      }
    }),
    vscode.commands.registerCommand('txTree.delete', async (node: any) => {
      if (node && node.path) {
        const confirm = await vscode.window.showWarningMessage(
          `¿Estás seguro de que deseas eliminar "${node.label}"?`,
          { modal: true },
          'Yes'
        );
        if (confirm === 'Yes') {
          try {
            const stats = fs.lstatSync(node.path);
            if (stats.isDirectory()) {
              fs.rmdirSync(node.path, { recursive: true });
            } else {
              fs.unlinkSync(node.path);
            }
            vscode.window.showInformationMessage(`Eliminado "${node.label}"`);
            fileExplorerProvider.refresh();
          } catch (err: any) {
            vscode.window.showErrorMessage(`Delete failed: ${err.message}`);
          }
        }
      }
    })
  );
}

export function deactivate() {}
