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
var replacementFuncs = {
	"RegExp" : 'R',
	"JSON.stringify" : 'J',
	//"eval": 'Q',
	'document': 'd',
	'Object.defineProperty': 'O',
	'Object.keys': 'K',
	'customElements': 'm',
	'WeakMap': 'W',
};

var replacementProps = { // These appear as .name
	'shadowRoot': 'S',
	'isProxy': 'P',
	'filter': 'F',
	"length": 'l',
	"substr": 's',
	"addEventListener": 'a',
	"innerHTML": 'H',
	"querySelectorAll": 'q',
	"slice": 'c',
	"startsWith": 'w',
	"value": 'v',
	'firstChild': 'f',
	'lastChild': 'L',
	'children': 'h',
	'parentNode': 'p',
	'removeChild': 'o',
	'selectedIndex': 'i',
	'attributes': 't',
	'setAttribute': 'x',
	"getAttribute": 'A',
	'hasAttribute': 'V',
	'removeAttribute': 'r',
	'name': 'n',
	'appendChild': 'u',
	'lastIndex': 'Y',
	'match': 'M',
	'trim': 'T',
	//'connectedCallback': 'C'
};

var a = [];
for (let name in replacementFuncs) {
	code = code.replace(new RegExp(name+'(?![A-Za-z0-9_$])', 'g'), replacementFuncs[name]);
	a.push('var ' + replacementFuncs[name] + '=' + name + ';');
}

for (let name in replacementProps) {
	let regex = new RegExp('\\.' + name + '(?![A-Za-z0-9_$])', 'g');
	code = code.replace(regex, '['+replacementProps[name]+']');
	a.push('var ' + replacementProps[name] + '=' + "'" + name + "';");
}
code = code.replace('//%replace%', a.join(''));


fs.writeFileSync('../xelement.r.js', code);

var options = {
	compress: {
		passes: 5
	},
	mangle: {
		reserved: ['event'],
		eval: true,
		properties: { regex: /_$/ }
	}
};


var result = Terser.minify(code, options);

console.log(result.error || 'Successfully created xelement.js and xelement.min.js');
fs.writeFileSync('../xelement.min.js', result.code);