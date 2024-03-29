// Regex for matching javascript variables.  Made from pieces of this regex:  https://www.regexpal.com/?fam=112426
var identifier = '([$a-z_][$a-z0-9_]*)';       // A regular variable name.
var dotIdentifier = '\\.\\s*' + identifier;
var varBrD = '\\[\\s*"(([^"]|\\")*)"\\s*]';  // A ["as\"df"] index
var varBrS = varBrD.replace(/"/g, "'");      // A ['as\'df'] index
var varNum = "\\[\\s*(\\d+)\\s*]";           // A [3] index (numerical)

var or = '\\s*|\\s*';
var varProp = dotIdentifier + or + varBrD + or + varBrS + or + varNum;

var or2 = '\\s*\\(?|^\\s*';
var varPropOrFunc = '^\\s*' + dotIdentifier + or2 + varBrD + or2 + varBrS + or2 + varNum + '\\s*\\(?';

var isStandaloneVarRegex = new RegExp('^' + identifier + '(' + varProp + ')*$', 'i');
var isSimpleCallRegex = new RegExp('^' + identifier + '(' + varProp + ')*\\(', 'i');
var varStartRegex = new RegExp(identifier + '\\s*\\(?', 'gi');
var varPropRegex  = new RegExp(varPropOrFunc, 'gi');

// https://mathiasbynens.be/notes/javascript-identifiers
// We exclude 'let,package,interface,implements,private,protected,public,static,yield' because testing shows Chrome accepts these as valid var names.
var nonVars = 'length,NaN,Infinity,caller,callee,prototype,arguments,true,false,null,undefined,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super'.split(/,/g);
var nonVars2 = 'super,NaN,Infinity,true,false,null,undefined'.split(/,/g); // Don't add "this." prefix to thse automatically.

/**
 * A stanalone var can automatically have "this." prepended to it.
 * @param {string} code
 * @returns {boolean} */
var isStandaloneVar = (code) => {
	return !nonVars2.includes(code) && !!code.trim().match(isStandaloneVarRegex);
};
var isStandaloneCall = (code) => {
	// if it starts with a variable followed by ( and has no more than one semicolon.
	code = code.trim();

	// If there's a semicolon other than at the end.
	// TODO: This doesn't account for if there's a semicolon in a string argument to the function.
	var semi = code.indexOf(';');
	if (semi !== -1 && semi !== code.length-1)
		return false;

	return !nonVars2.includes(code) && !!code.match(isSimpleCallRegex);
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
		var item = undefined;
		let regex = varStartRegex; // Reset for looking for start of a variable.
		let keepGoing = 1;
		let currentVar = [], matches;
		currentVar.index_ = []; // track the index of each match within code.
		while (keepGoing && code.length && !!(matches = regex.exec(code))) {

			// Add the start of the match.
			index += matches.index;


			code = code.slice(regex.lastIndex); // advance forward in parsing code.
			regex.lastIndex = 0; // reset the regex.

			// Don't grab functions or common functions properties as vars unless they are within brackets.
			// matches[1] is the match for a .variable and not something in brackets.
			// TODO: allow some nonvars if in brackets?
			keepGoing = (allowCall || !matches[0].endsWith('(')) && !nonVars.includes(matches[1]);
			if (keepGoing) {

				// fitler() removes undefineds from matches.
				// This lets us get the first non-undefiend parenthetical submatch.
				item = matches.filter(Boolean)[1];

				// Add varible property to current path
				if (includeThis || item !== 'this') {
					currentVar.push(item);
					currentVar.index_.push({
						start: index,
						end: index+item.length
					});
				}

				regex = varPropRegex; // switch to reading subsequent parts of the variable.
			}

			// Add the length of the match.
			index += matches[0].length;
		}

		// Start parsing a new variable.
		index += regex.lastIndex;
		regex.lastIndex = 0; // reset the regex.
		if (currentVar.length)
			result.push(currentVar);
		else if (!matches /*item !== 'this'*/) // if we found nothing, stop entirely.
			break;
	}

	return result;
};

// TODO: actual parsing.
var trimThis = function(code) {
	return code.replace(/^this\./, '');
};

/**
 * TODO: this function should leave alone anything after a :
 *
 * If a replacement value is "this", it'll be trimmed off the beginning.
 * @param code {string}
 * @param replacements {object<string, string>}
 * @returns {string} */
var replaceVars = (code, replacements) => {
	if (!Array.isArray(replacements))
		replacements = [replacements];

	for (let replacement of replacements)
		for (let oldVar in replacement) {
			var paths = parseVars(code, 1);
			for (let path of paths.reverse()) { // We loop in reverse so the replacement indices don't get messed up.

				if (path.length >= 1 && path[0] === oldVar) {
					let newVal = replacement[oldVar];
					if (newVal === 'this')
						code = path[1] + (path.length > 2 ? code.slice(path.index_[2].start) : '');
					else
						code = code.slice(0, path.index_[0].start) + replacement[oldVar] + code.slice(path.index_[0].end);
				}
			}
		}
	return code;
};

/**
 * TODO: Could this be replaced with:
 * result = eval('{' + code + '}');
 * No, because sometimes the value needs this. prepended.  Or the properties are undefined.
 *
 * TODO: This will fail if code has ";" inside strings.
 * each key is in the format name: expr
 * @param code
 * @returns {object<string, string>} */
var parseObj = (code) => {
	//return eval('{' + code + '}');

	let result = {};
	let pieces = code.split(/\s*;\s*/); // splitting on comma will divide objects.  TODO, need to support a real parser.  JSON won't understand var names.  eval() will evaluate them.
	for (let piece of pieces) {
		var colon = piece.indexOf(':');
		let value =  piece.slice(colon+1).trim();
		if (value) {
			let key = piece.slice(0, colon).trim();
			result[key] = value;
		}

		//let [key, value] = piece.split(/\s*:\s*/); // this splits more than once.
		//result[key] = value;
	}
	return result;
};

/*
var joinObj = (obj) => {
	var result = [];
	for (let name in obj)
		result.push (name + ':' + obj[name]);
	return result.join(';');
};
*/

/**
 * Parse "items : item" into two part, always splitting on the last colon.
 * @param code {string}
 * @return {[string, string, string]} foreachCode, loopVar, indexVar (optional) */
var parseLoop = (code) => {
	var result = code.split(/[,:](?=[^:]+$)/).map((x)=>x.trim()); // split on comma and colon only if there's no subsequent colons.
	if (result[2])
		result = [result[0], result[2], result[1]]; // swap elements 1 and 2, so indexVar is last.

	//#IFDEV
	if (!isStandaloneVar(result[1]))
		throw new XElementError('Could not parse loop variable in data-loop attribute "' + code + '".');
	if (result[2] && !isStandaloneVar(result[2]))
		throw new XElementError('Invalid index variable in data-loop attribute "' + code + '".');
	if (result.length > 3)
		throw new XElementError('Could not parse data-loop attribute "' + code + '".');
	//#ENDIF

	return result;

	/*
	// Parse code into foreach parts.
	var colon = code.lastIndexOf(':');
	if (colon < 0) // -1
		throw new XElementError('data-loop attribute "' + code + '" missing colon.');
	var result = [code.slice(0, colon)];       // foreach part
	var loopVar = code.slice(colon+1).trim(); // loop var
	var comma = loopVar.indexOf(',');
	if (comma >= 0) { // If index.
		result.push(loopVar.slice(0, comma).trim());
		result.push((loopVar.slice(comma+1).trim()));
	}
	else
		result.push(loopVar)

	return result;
	*/
};

/**
 * Add a "this." prefix to code where we can.
 * TODO: This only works for standalone variables.
 * @param code  {string}
 * @param context {object<string, string>}
 * @param isStandalone {function(string):boolean=} A function to detect whether the code is a stanadlone var.
 * @param prefix {string=} Defaults to "this"
 * @returns {string} */
var addThis = (code, context, isStandalone, prefix) => {
	if (Array.isArray(context))
		context = context[0]; // TODO: Instead of this hack, we need to handle context as an array.

	prefix = prefix || 'this';
	isStandalone = isStandalone || isStandaloneVar;
	if (!isStandalone(code))
		return code;

	// If it starts with this or an item in context, do nothing.
	code = code.trim();
	let contextVars = Object.keys(context || {});
	for (let pre of [prefix, ...contextVars])
		if (code.match(new RegExp('^' + pre + '(\s*[\.[]|$)'))) // starts with "prefix." or "prefix["
			return code;

	return prefix + '.' + code;
};

// Exports
window.parseLoop = parseLoop; // temporary for EditableSelect.

export { isStandaloneVar, isStandaloneCall, parseVars, trimThis, replaceVars, parseObj, parseLoop, addThis };