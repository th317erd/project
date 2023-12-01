import FileSystem from 'node:fs';
import Path       from 'node:path';
import Prompts    from 'prompts';
import Colors     from 'colors/safe.js';

const OVERWRITE_QUESTION = (message) => {
  let baseQuestions = [ 'Skip', 'Merge', 'Overwrite' ].map((title) => {
    return {
      value: {
        action: title.toLowerCase(),
        all:    false,
      },
      title,
    };
  });

  return {
    type:     'select',
    name:     'action',
    message:  message,
    choices:  baseQuestions.concat(baseQuestions.map((obj) => {
      return { title: `${obj.title} All`, value: { action: obj.value.action, all: true } };
    })),
  };
};

export class ProjectCommand {
  constructor(_args) {
    let args = _args || {};
    if (!args.config)
      throw new Error('"config" path not found');

    if (!args.root)
      throw new Error('"root" path not found');

    if (!args.templatePath)
      throw new Error('"templatePath" path not found');

    if (!FileSystem.existsSync(args.root))
      throw new Error(`"root" of [${args.root}] not found`);

    Object.assign(this, args);
  }

  isJSONFileType(filePath) {
    return (/\.json$/i).test(filePath);
  }

  loadJSON(filePath, skipExcludeKeys) {
    let content = FileSystem.readFileSync(filePath, 'utf8');
    let data    = (new Function(`return ${content};`))();

    if (skipExcludeKeys !== true && data && Object.prototype.hasOwnProperty.call(data, '__templateExcludeKeys')) {
      let templateExcludeKeys = data['__templateExcludeKeys'] || [];
      for (let i = 0, il = templateExcludeKeys.length; i < il; i++) {
        let key = templateExcludeKeys[i];
        delete data[key];
      }

      delete data['__templateExcludeKeys'];
    }

    return data;
  }

  async walkFiles(path, callback) {
    let files = FileSystem.readdirSync(path);
    for (let i = 0, il = files.length; i < il; i++) {
      let fileName  = files[i];
      let filePath  = Path.join(path, fileName);
      let stat      = FileSystem.statSync(filePath);

      if (stat.isDirectory()) {
        await this.walkFiles(filePath, callback);
        continue;
      }

      await callback({ path, fileName, filePath, stat });
    }
  }

  getDestinationPath(sourceRoot, filePath) {
    let relativePath = filePath.substring(sourceRoot.length).replace(/^[.\\]+/, '');
    return Path.join(this.root, relativePath);
  }

  async mkdir(path) {
    FileSystem.mkdirSync(path, { recursive: true });
  }

  async mergeFiles({ filePath, targetFilePath }) {
    if (this.isJSONFileType(filePath) && this.isJSONFileType(targetFilePath)) {
      let data1       = this.loadJSON(filePath);
      let data2       = this.loadJSON(targetFilePath);
      let mergedData  = Object.assign({}, data2, data1);

      FileSystem.writeFileSync(targetFilePath, JSON.stringify(mergedData, undefined, 2), 'utf8');
    } else {
      throw new Error(`I don't know how to merge the file type "${filePath.replace(/^.*?(\.[\w-]+)$/, '$1')}".`);
    }
  }

  async copyFile(scope) {
    let {
      context,
      filePath,
      targetFilePath,
    } = scope;

    let overwriteAction = context.overwriteAction;

    if (FileSystem.existsSync(targetFilePath)) {
      if (!overwriteAction) {
        console.log(`Copying file ${Colors.yellow(`"${'' + filePath}"`)} -> to ${Colors.red(`"${'' + targetFilePath}"`)}\nTarget file ${Colors.red(`"${'' + targetFilePath}"`)} already exists:`);

        let { action } = await this.awaitUserSelection(OVERWRITE_QUESTION('What should I do?'));
        overwriteAction = action;

        if (overwriteAction.all)
          context.overwriteAction = overwriteAction;
      }
    } else {
      // If no file exists then "overwrite"
      overwriteAction = { action: 'overwrite' };
    }

    if (overwriteAction.action === 'skip')
      return;

    if (overwriteAction.action === 'merge') {
      // keep
      console.log('Would merge!', targetFilePath);
      await this.mergeFiles(scope);
    } else {
      console.log('Would overwrite!', targetFilePath);
      await this.mkdir(Path.dirname(targetFilePath));
      FileSystem.copyFileSync(filePath, targetFilePath);
    }
  }

  async awaitUserSelection(questions) {
    const response = await Prompts(questions);
    return response;
  }

  async initCommand({ template }) {
    await this.awaitUserSelection();

    let templatePath  = Path.join(this.templatePath, template);
    let context       = {};

    await this.walkFiles(templatePath, async (scope) => {
      let { filePath }    = scope;
      let targetFilePath  = this.getDestinationPath(templatePath, filePath);

      await this.copyFile({ ...scope, context, targetFilePath });
    });
  }
}
