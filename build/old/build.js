// Install node.js
// cd to this folder
// Then run "node build.js" to create concatenated and minified files.
var fs = require('fs');

// We use terser 3.14.1, because 
// terser >=3.16 fails due to missing source-map depenedency.
var Terser = require("./terser.min.js");  

// Concatenate
var code = [
	fs.readFileSync('../src/utils.js', 'utf8'),
	fs.readFileSync('../src/parsevars.js', 'utf8'),
	fs.readFileSync('../src/watchproxy.js', 'utf8'),
	fs.readFileSync('../src/watch.js', 'utf8'),
	fs.readFileSync('../src/bindings.js', 'utf8'),
	fs.readFileSync('../src/xelement.js', 'utf8')
];
code =
	'// https://github.com/Vorticode/xelement\r\n' +
	'(function() {\r\n' +
		'//%replace%\r\n' +
		code.join(';\r\n\r\n') +
	'\r\n})();';

fs.writeFileSync('../xelement.js', code);


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
fs.writeFileSync('../xelement.min.js', result.code);