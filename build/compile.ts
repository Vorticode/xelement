/**
 * Take a typescript file with es imports and produce
 * .js and .js.map files, placing them in the same directory.
 * Replaces .ts import paths with .js
 * Optionally follow dependencies, bundle, and minify.
 *
 * Options:
 * (no args) Just transpile a single .ts file, placing its .js file next to it. 
 * -d Dependencies:  Compile a .ts file and all of its dependencies, placing them beside the .ts files.  
      Not compatible with -b since -b overwrites the main .js file.
 * -p SourceMaps:  Produce .map file or files for each outputs
 *
 *
 * Unimplemented options:
 * -c Compile:  Compile a single .ts file, placing a .js file next to it.  
 *    Not compatible with -d, -b, or -m arguments.
 *    CURRENTLY FAILS DUE TO ASSERTION ERROR IN DENO
 * -b Bundle:  Compile a .ts file and all of its dependencies into a single file.
 * -m Minify:  Compile a .ts file and its dependencies, combine it into a single minimized file.
 *
 * -s strict
 * -t producde .d.ts file
 * -w Stay running and recompile on any file changes.
 * -v Verbose:  List filenames created.
 *
 * Idea for new set of options:

 * @example:  Transpile one specific file only, don't do type checking, creating myfile.js
 * deno run -A --unstable compile.ts myfile.t
 *
 * @example  Compile myfile.ts and all of its dependencies, placying  .js and .js.map files next to each.
 * deno run -A --unstable compile.ts -d -p myfile.ts
 
 * @example  Bundle dependencies and minify, producing myfile.min.js and myfile.min.map.js
 * deno run -A --unstable compile.ts -m -p myfile.ts
 *
 * @example Have IntelliJ, PhpStorm, or WebStorm use Deno to compile typescript files as you type.
 * TODO
 *
 * @author Eric Poggel (Vorticode)
 * @license MIT
 *
 */


//import "https://unpkg.com/source-map@0.7.3/dist/source-map.js";
//import "https://unpkg.com/terser@4.8.0/dist/bundle.min.js";

//import typescript from './lib/rollup.ts';
// declare class rollup {
// 	static rollup(arg:any):any;
// }

// 1. Get file from command line, prepare file names.
let filePath = Deno.args.slice(-1)[0]; // last argument
if (!filePath) {
	console.error("Please provide an input file.");
	Deno.exit();
}

filePath = filePath.replace(/\\/g, '/');
let jsFile = filePath.replace(/\.ts$/, '.js');

// 2. Get other options from the command line.
var options = {
	compile: Deno.args.includes('-c'),
	dependencies: Deno.args.includes('-d'),
	bundle: Deno.args.includes('-b'),
	minify: Deno.args.includes('-m'),
	map: Deno.args.includes('-p')
};

// 2. Open the file.
var files:Record<string, string> = {};
files[filePath] = await Deno.readTextFile(filePath);

// 3. Compile.
var compileOptions:Record<string, any> = {
	lib: ["dom", 'esnext'],
	sourceMap: true
};
let outputFiles:Record<string, string> = {};

// Transpile single file only.
if (!options.compile && !options.dependencies && !options.bundle && !options.minify) {
	const result = await Deno.transpileOnly(files);
	for (let name in result) {

		// Replace .ts imports with .js
		let source = result[name].source.replace(/(?<=import\s+.+\s+from\s*['"].+)\.ts(?=['"])/g, '.js');

		outputFiles[jsFile] = source;

		if (options.map && result[name].map)
			outputFiles[jsFile + '.map'] = result[name].map || '';
	}
}

// Compile single file only.
else if (options.compile && !options.dependencies && !options.bundle && !options.minify) {
	const [diagnostics, emit] = await Deno.compile(filePath, files, compileOptions);
	for (let name in emit)
		outputFiles[name] = emit[name];
}

else {

	// Compile all files.
	const [diagnostics, emit] = await Deno.compile(filePath, undefined, compileOptions);
	for (let name in emit) {
		let path = name.startsWith('file:///') ? name.slice(8) : name; // trim 'file:///' from path prefix.
		if (options.map || !name.endsWith('.map'))
			outputFiles[path] = emit[name];
	}
	
	if (options.bundle || options.minify) {
		// TODO: Rollup
		// TODO: Allow for compile and minify, but prevent the bundled.js from overwriting the main file.
	}
	if (options.minify) {
		// TODO: Terser
	}
}

// 4. Write output files.
console.log(Object.keys(outputFiles));
for (let name in outputFiles) {
	Deno.writeTextFileSync(name, outputFiles[name]);
}


