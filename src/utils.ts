import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export function getPlatformPathSeparator(): string {
  return path.sep;
}

export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join(getPlatformPathSeparator());
}

/**
 * Copia recursivamente un archivo o directorio desde `src` a `dest`.
 */
export function copyRecursive(src: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.stat(src, (err, stats) => {
      if (err) {return reject(err);}
      if (stats.isDirectory()) {
        fs.mkdir(dest, { recursive: true }, (err) => {
          if (err) {return reject(err);}
          fs.readdir(src, (err, files) => {
            if (err) {return reject(err);}
            Promise.all(
              files.map(file => copyRecursive(path.join(src, file), path.join(dest, file)))
            )
              .then(() => resolve())
              .catch(reject);
          });
        });
      } else {
        fs.copyFile(src, dest, (err) => {
          if (err) {return reject(err);}
          resolve();
        });
      }
    });
  });
}
