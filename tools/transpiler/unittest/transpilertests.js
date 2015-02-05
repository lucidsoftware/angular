var assert = require("assert");
var compiler = require('../index');

// fixme: copied from top of gulpfile
var OPTIONS = {
  sourceMaps: true,
  annotations: true, // parse annotations
  types: true, // parse types
  script: false, // parse as a module
  memberVariables: true, // parse class fields
  outputLanguage: 'dart'
};

describe('transpile to dart', function(){

  // https://github.com/angular/angular/issues/509
  it('should not interpolate inside old quotes', function(){
    var result = compiler.compile(OPTIONS, "test.js",
      "var a:number = 1;" +
      "var s1:string = '${a}';" +
      "var s2:string = `${a}`;" +
      "var s3:string = '\\${a}';");
    expect(result.js).toBe("library test;\n" +
      "num a = 1;\n" +
      "String s1 = '\\${a}';\n" +
      "String s2 = '''${a}''';\n" +
      "String s3 = '\\${a}';\n");
  })
});
