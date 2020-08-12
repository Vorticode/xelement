
const fs = require('fs');
const rollup = require('./rollup/rollup.js');
const Terser = require("./terser.min.js"); // We use terser 3.14.1, because terser >=3.16 fails due to missing source-map depenedency.


async function rollupBuild() {
	// see below for details on the options
	const inputOptions = {
		input: '../src/xelement.js'
	};
	const outputOptions = {
		output: {
			file: '../xelement2.js'
		}
	};


	// create a bundle
	const bundle = await rollup.rollup(inputOptions);

	console.log(bundle.watchFiles); // an array of file names this bundle depends on

	// generate output specific code in-memory
	// you can call this function multiple times on the same bundle object
	const { output } = await bundle.generate(outputOptions);

	for (const chunkOrAsset of output) {
		if (chunkOrAsset.type === 'asset') {
			// For assets, this contains
			// {
			//   fileName: string,              // the asset file name
			//   source: string | Uint8Array    // the asset source
			//   type: 'asset'                  // signifies that this is an asset
			// }
			//console.log('Asset', chunkOrAsset);
		} else {
			// For chunks, this contains
			// {
			//   code: string,                  // the generated JS code
			//   dynamicImports: string[],      // external modules imported dynamically by the chunk
			//   exports: string[],             // exported variable names
			//   facadeModuleId: string | null, // the id of a module that this chunk corresponds to
			//   fileName: string,              // the chunk file name
			//   implicitlyLoadedBefore: string[]; // entries that should only be loaded after this chunk
			//   imports: string[],             // external modules imported statically by the chunk
			//   isDynamicEntry: boolean,       // is this chunk a dynamic entry point
			//   isEntry: boolean,              // is this chunk a static entry point
			//   isImplicitEntry: boolean,      // should this chunk only be loaded after other chunks
			//   map: string | null,            // sourcemaps if present
			//   modules: {                     // information about the modules in this chunk
			//     [id: string]: {
			//       renderedExports: string[]; // exported variable names that were included
			//       removedExports: string[];  // exported variable names that were removed
			//       renderedLength: number;    // the length of the remaining code in this module
			//       originalLength: number;    // the original length of the code in this module
			//     };
			//   },
			//   name: string                   // the name of this chunk as used in naming patterns
			//   referencedFiles: string[]      // files referenced via import.meta.ROLLUP_FILE_URL_<id>
			//   type: 'chunk',                 // signifies that this is a chunk
			// }
			//console.log('Chunk', chunkOrAsset.modules);
		}
	}

	// or write the bundle to disk
	await bundle.write(outputOptions);


	terserBuild();
}

function terserBuild() {

	// Concatenate
	// var code = [
	// 	fs.readFileSync('../src/utils.js', 'utf8'),
	// 	fs.readFileSync('../src/parsevars.js', 'utf8'),
	// 	fs.readFileSync('../src/watchproxy.js', 'utf8'),
	// 	fs.readFileSync('../src/watch.js', 'utf8'),
	// 	fs.readFileSync('../src/bindings.js', 'utf8'),
	// 	fs.readFileSync('../src/xelement.js', 'utf8')
	// ];
	// code =
	// 	'// https://github.com/Vorticode/xelement\r\n' +
	// 	'(function() {\r\n' +
	// 	'//%replace%\r\n' +
	// 	code.join(';\r\n\r\n') +
	// 	'\r\n})();';
	//
	// fs.writeFileSync('../xelement.js', code);

	var code = [fs.readFileSync('../xelement2.js')].join('');

	// Do replacements
	var replacementFuncs = [
		'Array.from',
		"RegExp",
		"JSON.stringify",
		"eval",
		'document',
		'Object.defineProperty',
		'Object.keys',
		'customElements',
		'WeakMap', // Completely removes it.  something's broken.

		// round 2
		'Array'
	];

	var replacementProps = [ // These appear as .name
		"addEventListener",
		//'apply', // makes it larger.
		'attributes',
		//'appendChild',
		'bind',
		'checkbox',
		'checked', // doesn't replace anything.
		'children',
		'classList',
		//'constructor', // makes no difference.
		'data-',
		'data-loop',
		'filter',
		'firstChild',
		"getAttribute",
		'hasAttribute',
		//'includes', // makes no difference
		'indexOf',
		"innerHTML",
		'insertBefore',
		'isProxy',
		'lastChild',
		'lastIndex',
		"length",
		'match',
		'name', // doesn't work.
		'parentNode',
		'push',
		"querySelectorAll",
		'removeAttribute',
		'removeChild',
		'removeProxy',
		'setAttribute',
		"slice",
		'shadowRoot',
		//'split', // Doesn't make it any smaller.
		"startsWith",
		'trim',
		"value",

		'\\$isProxy',
		'\\$removeProxy',
		//'push', // makes no difference in size.
		//'string', // Increases size
	];
	var i=0;
	var a = [];
	for (let name of replacementFuncs) {
		let vname = 'i' + i;
		let newCode = code.replace(new RegExp(name+'(?![A-Za-z0-9_$])', 'g'), vname);
		if (newCode.length < code.length) {
			// Add variable definition.
			a.push('var ' + vname + '=' + name + ';');

			code = newCode;
		}

		i++;
	}


	for (let name of replacementProps) {
		let vname = 'i' + i;

		// Replace .prop instances
		let regex = new RegExp('\\.' + name + '(?![A-Za-z0-9_$])', 'g');
		let newCode = code.replace(regex, '['+vname+']');

		// Replace string instances of the props
		regex = new RegExp('"' + name + "'", 'g');
		newCode = newCode.replace(regex, vname);

		regex = new RegExp("'" + name + "'", 'g');
		newCode = newCode.replace(regex, vname);

		// Only use this replacement if it makes it shorter.
		// (this length check fails b/c the replacemnt may be shorter after minified.).
		var def = 'var ' + vname + '=' + "'" + name + "';\r\n";
		//if (newCode.length + def.length < code.length)
		{
			// Add variable definition.
			a.push(def);

			code = newCode;
		}

		i++;
	}

	// Remove IFDEV preprocessor used for useful error messages.
	code = code.replace(/\/\/#IFDEV[\s\S]*?\/\/#ENDIF/gm, '');

	code = code.replace('//%replace%', a.join(''));


	//fs.writeFileSync('../xelement.r.js', code);

	var options = {
		//ecma: 8, // doesn't make it any smaller
		compress: {
			passes: 5
		},
		mangle: {
			reserved: ['event'],
			eval: true, // We use reserved words to not mangle names used in eval.
			properties: { regex: /_$/ }
		}
	};


	var result = Terser.minify(code, options);

	console.log(result.error || 'Successfully created xelement.js and xelement.min.js');
	fs.writeFileSync('../xelement2.min.js', result.code);
}

rollupBuild();
















