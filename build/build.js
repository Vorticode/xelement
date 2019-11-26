//node node_modules/terser/bin/terser -c -m reserved=['event'] -m eval --mangle-props regex=/_$/ --output xelement.min.js < xelement.js

var fs = require('fs');

// Concatenate
var code = [
	fs.readFileSync('../src/utils.js', 'utf8'),
	fs.readFileSync('../src/parseVars.js', 'utf8'),
	fs.readFileSync('../src/watch.js', 'utf8'),
	fs.readFileSync('../src/xelement.js', 'utf8')
];
code =
	'(function() {' +
		//'%replace%\n' +
		code.join(';') +
	'})();';

fs.writeFileSync('../xelement.js', code);


// Do replacements
var replacementFuncs = {
	"RegExp" : 'R',
	"JSON.stringify" : 'J',
	//"eval": 'Q',
	'document': 'd',
	'Object.defineProperty': 'O',
	'customElements': 'm',
};

var replacementProps = {
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


//fs.writeFileSync('../xelement.r.js', code);

var options = {
	compress: true,
	mangle: {
		reserved: ['event'],
		eval: true,
		properties: { regex: '_$' }
	}
};


var Terser = require("terser");
var result = Terser.minify(code, options);

console.log(result.error || 'Success');
fs.writeFileSync('../xelement.min.js', result.code);