import fg from 'fast-glob';
import fs from 'node:fs';
import path from 'node:path';
// import { execSync } from 'child_process';
import YAML from 'yaml';
import simpleGit from 'simple-git';

export function immediateDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))  // Exclude hidden dirs
    .map(dirent => path.join(dir, dirent.name));
}

/**
 * Find spago.yaml files within a given project directory
 * and ensure they're not ignored by Git
 */
export async function spagoFilesNotIgnoredByGit(projectDir) {
  const spagoFiles = await fg(['**/spago.yaml', '!**/test-fixtures/**', '!**/test/**', '!**/docs/**', '!**/docs-search/**'], {
    cwd: projectDir,
    absolute: true,
  });

  const nonIgnoredFiles = [];
  for (const file of spagoFiles) {
    try {
      const git = simpleGit(projectDir);

      // Check if the file is ignored by Git
      const isIgnored = await git.checkIgnore(file);
      if (isIgnored.length === 0) {
        nonIgnoredFiles.push(file);
      } else {
        console.log({ file, isIgnored })
      }
    } catch (error) {
      if (error.message.includes('is outside repository')) {
        // Handle case where file is not inside a Git repo
        console.warn(`Warning: ${file} is not part of a Git repository.`);
        // You can skip this file or log it for review
      } else {
        throw error; // Rethrow unexpected errors
      }
    }
  }

  return nonIgnoredFiles;
}

export async function readSpagoFileAndReturnPathAndName(spagoYamlPath) {
  try {
    // Read the file contents
    const fileContents = fs.readFileSync(spagoYamlPath, 'utf8');

    // Parse the YAML contents
    const document = YAML.parse(fileContents);
    // console.log(document)

    // Extract the project name
    const name = document.package && document.package.name
    if (!name) { return null; }

    // Return the path and name
    return { spagoYamlPath, name };
  } catch (error) {
    console.error(`Error reading or parsing ${spagoYamlPath}:`, error);
    return null; // Return null in case of an error
  }
}

// Helper function to run the command and parse the output
export function getPackageInfo(dir, spagoExePath) {
  try {
    const cmd = `${spagoExePath} ls packages --json`;
    const output = execSync(cmd, { cwd: dir, encoding: 'utf8' });
    return JSON.parse(output);
  } catch (error) {
    console.error(`Failed to run command in ${dir}:`, error.message);
    return null;
  }
}

export async function getLocalPackages(dir, spagoExePath) {
  // const packageInfo = getPackageInfo(dir, spagoExePath);
  //
  // if (!packageInfo) {
  //   return [];
  // }
  //
  // return Object.entries(packageInfo)
  //   .filter(([, details]) => details.type === 'workspace')
  //   .map(([name, _details]) => name);
  const files = await spagoFilesNotIgnoredByGit(dir)
  const namePathPairs = (await Promise.all(files.map(readSpagoFileAndReturnPathAndName))).filter(Boolean);
  return namePathPairs.map(x => x.name)
}

// Remove keys from YAML object
export function removeKeysFrom(keysToRemove, yamlDocument) {
  yamlDocument = yamlDocument.clone();
  keysToRemove.forEach(key => { yamlDocument.delete(key) });
  return yamlDocument
}

export function sortYamlMap(yamlDocument) {
  // Convert YAML document to a plain JavaScript object
  const yamlObject = yamlDocument.toJSON();

  // Function to recursively sort the keys of an object
  function sortObject(obj) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const sortedKeys = Object.keys(obj).sort();
      const sortedObj = {};
      sortedKeys.forEach(key => {
        sortedObj[key] = sortObject(obj[key]); // Recursively sort nested objects
      });
      return sortedObj;
    }
    return obj; // Return non-object values as they are
  }

  // Sort the object
  const sortedYamlObject = sortObject(yamlObject);

  // Create a new YAML document with the sorted object
  // return sortedYamlObject;
  return jsonToYamlDocument(sortedYamlObject)
  // return YAML.createDocument(sortedYamlObject);
}

function jsonToYamlDocument(json) { return new YAML.Document(json) }
