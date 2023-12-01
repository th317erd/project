#!/bin/env node

import FileSystem from 'node:fs';
import Path       from 'node:path';
import OS         from 'node:os';

import {
  CMDed,
  Types,
} from 'cmded';

import { ProjectCommand } from './project-command.js';

function loadConfig(filePath) {
  try {
    let content = FileSystem.readFileSync(filePath, 'utf8');
    return (new Function(`return ${content};`))();
  } catch (error) {
    FileSystem.mkdirSync(Path.dirname(filePath), { recursive: true });
    FileSystem.writeFileSync(filePath, '{}', 'uft8');
    return {};
  }
}

const COMMANDS = [
  'init',
];

const help = {
  '@usage':    'project [options]',
  '@examples': [
    './project init {template-name}',
  ],
};

let args = CMDed(({ $, store, fetch }) => {
  $('--config', Types.STRING(), { format: Path.resolve }) || store('config', Path.join(OS.homedir(), '.config', 'project', 'config.json'));

  let config = loadConfig(fetch('config'));

  $('--root', Types.STRING(), { format: Path.resolve }) || store('root', process.cwd());
  $('--templatePath', Types.STRING(), { format: Path.resolve }) || store('templatePath', config.templatePath);

  return $('init', ({ scope }) => {
    return scope('initCommand', ({ $ }) => {
      if ($('--template', Types.STRING()))
        return true;

      return $(({ args }, options, index) => {
        return {
          name:   'template',
          value:  args.consume(index),
        };
      }, Types.STRING());
    });
  });
}, { help });

if (args) {
  (async () => {
    try {
      let projectCommand = new ProjectCommand({
        config:       args.config,
        root:         args.root,
        templatePath: args.templatePath,
      });

      for (let i = 0, il = COMMANDS.length; i < il; i++) {
        let commandName = `${COMMANDS[i]}Command`;
        let options     = args[commandName];

        if (options)
          await projectCommand[commandName](options);
      }
    } catch (error) {
      console.error(error);
    }
  })();
}
