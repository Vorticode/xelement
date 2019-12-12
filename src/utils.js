//#IFDEV
class XElementError extends Error {
	constructor(msg) {
		super(msg);
	}
}
//#ENDIF

var arrayEq = (array1, array2) => {
	return array1.length === array2.length && array1.every((value, index) => value === array2[index])
};

var createEl = (html) => {
	var div = document.createElement('div');
	div.innerHTML = html;

	//  TODO: skip whitespace, comments
	return div.removeChild(div.firstChild);
};

/**
 * Return the array as a quoted csv string.
 * @param array {string[]}
 * @returns {string} */
var csv = (array) => {
	return JSON.stringify(array).slice(1, -1); // slice() to remove starting and ending [].
};

var isObj = (obj) => {
	return obj !== null && typeof obj === 'object';
};

/**
 * Is name a valid attribute for el.
 * @param el {HTMLElement}
 * @param name {string}
 * @returns {boolean} */
var isValidAttribute = (el, name) => {
	if (name.startsWith('data-') || el.hasAttribute(name))
		return true;
	if (name.startsWith('on') && events.includes(name.slice(2)))
		return true;


	if (name in el)
		return false;

	// Try setting the prop to see if it creates an attribute.
	el[name] = 1;
	var isAttr = el.hasAttribute(name);
	delete el[name];
	return isAttr;
};

var keysStartWith = (obj, prefix) => {
	var result = [];
	for (let key in obj)
		if (key.startsWith(prefix))
			result.push(obj[key]);
	return result;
};

/**
 * @param el {HTMLElement}
 * @returns {int} */
var parentIndex = (el) => {
	if (!el.parentNode)
		return 0;
	return Array.prototype.indexOf.call(el.parentNode.children, el);
};


/**
 * Evaluate expr, but allow undefined variables.
 * @param expr {string}
 * @returns {*} */
function safeEval(expr) {
	try {
		return eval(expr);
	}
	catch (e) { // Don't fail for null values.
		if (!(e instanceof TypeError) || (!e.message.match('undefined') && !e.message.match('null')))
			throw e;
	}
	return undefined;
}


/**
 * @param obj {object}
 * @param path {string[]}
 * @param create {boolean=false} Create the path if it doesn't exist.
 * @param value {*=} If not undefined, set the object's path field to this value. */
var traversePath = (obj, path, create, value) => {
	for (let i=0; i<path.length; i++) {
		let srcProp = path[i];

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (create) {

				if (i === path.length-1)
				{
					// deliberately empty.  but need to refactor loop logic.
				}

				// If next level path is a number, create as an array
				else if ((path[i + 1] + '').match(/^\d+$/))
					obj[srcProp] = [];
				else
					obj[srcProp] = {};
			}
			else
				return undefined; // can't traverse
		}

		// If last item in path
		if (i === path.length-1) {
			if (value !== undefined)
				obj[srcProp] = value;
		}

		// Traverse deeper along destination object.
		obj = obj[srcProp];
	}



	return obj;
};



// Shortened version of this answer: stackoverflow.com/a/18751951
var events = Object.keys(document.__proto__.__proto__)
	.filter((x) => x.startsWith('on'))
	.map(   (x) => x.slice(2));


