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
// We exclude 'let,package,interface,implements,private,protected,public,static,yield' because testing shows Chrome accepts these as valid var names.
var nonVars = 'length,NaN,Infinity,caller,callee,prototype,arguments,true,false,null,undefined,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super'.split(/,/g);

var isSimpleVar_ = (code) => {
	return !!code.trim().match(isSimpleVarRegex);
};
var isSimpleCall_ = (code) => {
	// if it starts with a variable followed by ( and has no more than one semicolon.
	code = code.trim();

	// If there's a semicolon other than at the end.
	var semi = code.indexOf(';');
	if (semi !== -1 && semi !== code.length-1)
		return false;

	return !!code.match(isSimpleCallRegex);
};

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
var parseVars = (code, includeThis, allowCall) => {
	//code = code.trim(); // Breaks indices.
	var result = [];
	var index = 0;

	while (code.length) {
		let regex = varStartRegex; // Reset for looking for start of a variable.
		let keepGoing = 1;
		let current = [], matches;
		current.index_ = []; // track the index of each match within code.
		while (keepGoing && code.length && !!(matches = regex.exec(code))) {

			// Add the start of the match.
			index += matches.index;

			code = code.slice(regex.lastIndex); // advance forward in parsing code.
			regex.lastIndex = 0; // reset the regex.

			// Don't grab functions or common functions properties as vars unless they are within brackets.
			// matches[1] is the match for a .variable and not something in brackets.
			// TODO: allow some nonvars if in brackets.
			keepGoing = (allowCall || !matches[0].endsWith('(')) && !nonVars.includes(matches[1]);
			if (keepGoing) {

				// fitler() removes undefineds from matches.
				// This lets us get the first non-undefiend parenthetical submatch.
				let item = matches.filter(Boolean)[1];

				// Add varible property to current path
				if (includeThis || item !== 'this') {
					current.push(item);
					current.index_.push(index);
				}

				regex = varPropRegex; // switch to reading subsequent parts of the variable.
			}

			// Add the length of the match.
			index += matches[0].length;
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
};

/**
 * @param code {string}
 * @param replacements {object<string, string>}
 * @returns {string} */
var replaceVars = (code, replacements) => {
	var paths = parseVars(code, 1);
	for (let path of paths.reverse()) // We loop in reverse so the replacement indices don't get messed up.
		for (let oldVar in replacements) {
			if (path.length >= 1 && path[0] === oldVar)
				// replacements[oldVar] is newVar.
				code = code.slice(0, path.index_[0]) + replacements[oldVar] + code.slice(path.index_[0] + oldVar.length);
		}

	return code;
};

/**
 * Parse "items : item" into two part, always splitting on the last colon.
 * @param code {string}
 * @return {[string, string]} */
var parseLoop = (code) => {
	// Parse code into foreach parts.
	var colon = code.lastIndexOf(':');
	if (colon === -1)
		throw new Error('data-loop attribute "' + code + '" missing colon.');
	return [
		code.slice(0, colon),      // foreach part
		code.slice(colon+1).trim() // loop var
	];
};


var addThis = (code, context, isSimple) => {
	isSimple = isSimple || isSimpleVar_;
	if (!isSimple(code))
		return code;

	// If it starts with this or an item in context, do nothing.
	code = code.trim();
	for (let prefix of ['this', ...Object.keys(context || {})])
		if (code.match(new RegExp('^' + prefix + '\s*[\.[]'))) // starts with "prefix." or "prefix["
			return code;

	return 'this.' + code;
};