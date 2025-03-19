import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigManager {
  private configPath: string;

  constructor(context: vscode.ExtensionContext) {
    // Aseguramos que el directorio de globalStorage existe
    if (!fs.existsSync(context.globalStoragePath)) {
      fs.mkdirSync(context.globalStoragePath, { recursive: true });
    }
    this.configPath = path.join(context.globalStoragePath, 'folders.json');
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify([]));
    }
  }

  getFolders(): string[] {
    const data = fs.readFileSync(this.configPath, 'utf-8');
    return JSON.parse(data) as string[];
  }

  addFolder(folderPath: string): void {
    const folders = this.getFolders();
    if (!folders.includes(folderPath)) {
      folders.push(folderPath);
      fs.writeFileSync(this.configPath, JSON.stringify(folders));
    }
  }

  removeFolder(folderPath: string): void {
    let folders = this.getFolders();
    folders = folders.filter(folder => folder !== folderPath);
    fs.writeFileSync(this.configPath, JSON.stringify(folders));
  }
}
