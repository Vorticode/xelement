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
	fs.readFileSync('../src/parseVars.js', 'utf8'),
	fs.readFileSync('../src/watch.js', 'utf8'),
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
	"RegExp",
	"JSON.stringify",
	"eval",
	'document',
	'Object.defineProperty',
	'Object.keys',
	'customElements',
	'WeakMap',
];

var replacementProps = [ // These appear as .name
	'shadowRoot',
	'isProxy',
	'filter',
	"length",
	//"substr", // we always use slice instead.
	"addEventListener",
	"innerHTML",
	"querySelectorAll",
	"slice",
	"startsWith",
	"value",
	'firstChild',
	'lastChild',
	'children',
	'parentNode',
	'removeChild',
	'attributes',
	'setAttribute',
	"getAttribute",
	'hasAttribute',
	'removeAttribute',
	'name',
	'appendChild',
	'lastIndex',
	'match',
	'trim',
	'bind',
	'data-loop',
	'data-',
	'checkbox',
	'removeProxy',
	'checked', // makes no difference
	//'push': 'PU', // makes no difference in size.
	//'string': 'STR', // Increases size
	//'connectedCallback': 'CC'
];
var i=0;
var a = [];
for (let name of replacementFuncs) {
	let vname = 'i' + i;
	code = code.replace(new RegExp(name+'(?![A-Za-z0-9_$])', 'g'), vname);

	// Add variable definition.
	a.push('var ' + vname + '=' + name + ';');

	i++;
}


for (let name of replacementProps) {
	let vname = 'i' + i;

	// Replace .prop instances
	let regex = new RegExp('\\.' + name + '(?![A-Za-z0-9_$])', 'g');
	code = code.replace(regex, '['+vname+']');

	// Replace string instances of the props
	regex = new RegExp('"' + name + "'", 'g');
	code = code.replace(regex, vname);

	regex = new RegExp("'" + name + "'", 'g');
	code = code.replace(regex, vname);

	// Add variable definition.
	a.push('var ' + vname + '=' + "'" + name + "';\r\n");
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