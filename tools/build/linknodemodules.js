var fs = require('fs');
var path = require('path');

module.exports = function(gulp, plugins, config) {
  function symlink(relativeFolder, linkDir) {
    var sourceDir = path.join('..', relativeFolder);
    if (!fs.existsSync(linkDir)) {
      console.log('creating link', linkDir, sourceDir);
      try {
        fs.symlinkSync(sourceDir, linkDir, 'dir');
      }
      catch(e) {
        var sourceDir = path.join(config.dir, relativeFolder);
        console.log('linking failed: trying to hard copy', linkDir, sourceDir);
        copyRecursiveSync(sourceDir, linkDir);
      }
    }
  }

  return function() {
    var nodeModulesDir = path.join(config.dir, 'node_modules');
    if (!fs.existsSync(nodeModulesDir)) {
      fs.mkdirSync(nodeModulesDir);
    }
    getSubdirs(config.dir).forEach(function(relativeFolder) {
      if (relativeFolder === 'node_modules') {
        return;
      }

      var linkDir = path.join(nodeModulesDir, relativeFolder);
      symlink(relativeFolder, linkDir);
    });
    // Also symlink the tools, so tests can require metadata, compiler_cli, etc.
    symlink('../../tools', path.join(nodeModulesDir, 'tools'), 'tools');
  };
};

function copyRecursiveSync (src, dest) {
  if (fs.existsSync(src)) {
    var stats = fs.statSync(src);
    if (stats.isDirectory()) {
      fs.mkdirSync(dest);
      fs.readdirSync(src).forEach(function(childItemName) {
        copyRecursiveSync(path.join(src, childItemName),
                          path.join(dest, childItemName));
      });
    } else {
      fs.writeFileSync(dest, fs.readFileSync(src));
    }
  }
}

function getSubdirs(rootDir) {
  return fs.readdirSync(rootDir).filter(function(file) {
    if (file[0] === '.') {
      return false;
    }
    var dirPath = path.join(rootDir, file);
    return fs.statSync(dirPath).isDirectory();
  });
}
