// Regex for matching javascript variables.  Made from pieces of this regex:  https://www.regexpal.com/?fam=112426
var varStart = '([$a-z_][$a-z0-9_]*)';       // A regular variable name.
var varDotStart = '\\.\\s*' + varStart;
var varBrD = '\\[\\s*"(([^"]|\\")*)"\\s*]';  // A ["as\"df"] index
var varBrS = varBrD.replace(/"/g, "'");      // A ['as\'df'] index
var varNum = "\\[\\s*(\\d+)\\s*]";           // A [3] index (numerical)

var or = '\\s*|\\s*';
var varProp = varDotStart + or + varBrD + or + varBrS + or + varNum;

var or2 = '\\s*\\(?|^\\s*';
var varPropOrFunc = '^\\s*' + varDotStart + or2 + varBrD + or2 + varBrS + or2 + varNum + '\\s*\\(?';

var isSimpleVarRegex = new RegExp('^' + varStart + '(' + varProp + ')*$', 'i');
var isSimpleCallRegex = new RegExp('^' + varStart + '(' + varProp + ')*\\(', 'i');
var varStartRegex = new RegExp(varStart, 'gi');
var varPropRegex  = new RegExp(varPropOrFunc, 'gi');

// https://mathiasbynens.be/notes/javascript-identifiers
var nonVars = 'length,caller,callee,prototype,arguments,true,false,null,undefined,NaN,Infinity,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super,implements,interface,let,package,private,protected,public,static,yield'.split(/,/g);

function isSimpleVar_(code) {
	return code.trim().match(isSimpleVarRegex) !== null;
}
function isSimpleCall_(code) {
	// if it starts with a variable followed by ( and has no more than one semicolon.
	code = code.trim();
	var semiCount = (code.match(/;/g) ||[]).length;
	if (semiCount > 1 || semiCount===1 && code.slice(-1) !== ';')
		return false; // code has more than one semicolon, or one semicolon that's not at the end.
	return code.match(isSimpleCallRegex) !== null;
}

/**
 * Take a string of code and parse out all JavaScript variable names,
 * ignoring function calls "name(" and anything in nonVars that's not inside [''].
 * @param code {string}
 * @param includeThis {boolean=false} Include "this." when parsing variables.
 * @param allowCall {boolean=false}
 * @returns {string[][]} An array of paths, where a path is all sub-properties of a variable name.
 * @example
 *     parseVars('this.person.firstName.substr()', true) // returns [['this', 'person', 'firstName']]
 *     parseVars('var a = b["c"]') // returns [['a'], ['b', 'c']] */
function parseVars(code, includeThis, allowCall) {
	//code = code.trim(); // Breaks indices.
	var result = [];
	var index = 0;

	while (code.length) {
		let current = [], matches;
		current.index_ = []; // track the index of each match within code.
		var regex = varStartRegex; // Reset for looking for start of a variable.
		while (code.length && (matches = regex.exec(code)) !== null) {

			//regex.lastIndex = matches.index; // reset the regex.
			index += matches.index;

			code = code.substr(regex.lastIndex); // advance forward in parsing code.
			regex.lastIndex = 0; // reset the regex.

			// fitler() removes undefineds from matches.
			// This lets us get the first non-undefiend parenthetical submatch.
			let item = matches.filter(Boolean)[1];

			// Don't grab functions or common functions properties as vars unless they are within brackets.
			// matches[1] is the match for a .variable and not something in brackets.
			if ((!allowCall && matches[0].endsWith('(')) || nonVars.includes(matches[1])) {
				index += matches[0].length;
				break;
			}

			// Add varible property to current path
			if (includeThis || item !== 'this') {
				current.push(item);
				current.index_.push(index);
			}

			index += matches[0].length;
			regex = varPropRegex; // switch to reading subsequent parts of the variable.
		}

		// Start parsing a new variable.
		index += regex.lastIndex;
		regex.lastIndex = 0; // reset the regex.
		if (current.length)
			result.push(current);
		else
			break;
	}

	return result;
}

/**
 * @param code {string}
 * @param replacements {object<string, string>}
 * @returns {string} */
function replaceVars(code, replacements) {
	var paths = parseVars(code, true);
	for (let path of paths.reverse()) // We loop in reverse so the replacement indices don't get messed up.
		for (let oldVar in replacements) {
			let newVar = replacements[oldVar];
			if (path.length >= 1 && path[0] === oldVar)
				code = code.substr(0, path.index_[0]) + newVar + code.substr(path.index_[0] + oldVar.length);
		}

	return code;
}

/**
 * Parse "items : item" into two part, always splitting on the last colon.
 * @param code {string}
 * @return {[string, string]} */
function parseLoop(code) {
	// Parse code into foreach parts.
	var colon = code.lastIndexOf(':');
	if (colon === -1)
		throw new Error('data-loop attribute value "' + code + '" must include colon.');
	var loopVar = code.substr(colon+1).trim();
	code = code.substr(0, colon);

	if (isSimpleVar_(code) && !code.startsWith('this'))
		code = 'this.' + code;

	return [code, loopVar];
}