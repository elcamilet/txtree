import * as vscode from 'vscode';
import * as path from 'path';
import * as pathModule from 'path';
import * as fs from 'fs';
import { Uri } from 'vscode';
import { ConfigManager } from './config';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined | null | void> = new vscode.EventEmitter<FileNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileNode | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private configManager: ConfigManager, private extensionPath: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FileNode): Thenable<FileNode[]> {
    if (element) {
      return this.getFiles(element.path);
    } else {
      const folders = this.configManager.getFolders();
      return Promise.resolve(folders.map(folder => new FileNode(folder, vscode.TreeItemCollapsibleState.Collapsed, this.extensionPath)));
    }
  }

  private getFiles(folderPath: string): Thenable<FileNode[]> {
    return new Promise((resolve, reject) => {
      fs.readdir(folderPath, (err, entries) => {
        if (err) {
          return reject(err);
        }
        const files = entries.map(entry => {
          const entryPath = path.join(folderPath, entry);
          let isDirectory = false;
          try {
            isDirectory = fs.lstatSync(entryPath).isDirectory();
          } catch (e) {
            // En caso de error, se asume que no es directorio
          }
          return new FileNode(
            entryPath,
            isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            this.extensionPath
          );
        });
        resolve(files);
      });
    });
  }
}

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly path: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    private extensionPath: string
  ) {
    // Se usa pathModule.sep para asegurar la correcta división de la ruta
    const parts = path.split(pathModule.sep);
    super(parts.pop() || path, collapsibleState);

    this.iconPath = this.getIconPath();

    // Si es un fichero (no colapsable), asignamos el comando para abrirlo
    if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.command = {
        command: 'txTree.openFile',
        title: 'Open File',
        arguments: [this]
      };
    }
  }

  private getIconPath(): { light: Uri; dark: Uri } | undefined {
    if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      return {
        light: Uri.file(path.join(this.extensionPath, 'resources', 'light', 'file.svg')),
        dark: Uri.file(path.join(this.extensionPath, 'resources', 'dark', 'file.svg'))
      };
    } else {
      return {
        light: Uri.file(path.join(this.extensionPath, 'resources', 'light', 'folder.svg')),
        dark: Uri.file(path.join(this.extensionPath, 'resources', 'dark', 'folder.svg'))
      };
    }
  }
}
