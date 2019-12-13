// https://github.com/Vorticode/xelement
(function() {
//%replace%
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
		if (!(e instanceof TypeError) || (!e.message.match('undefined')))
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


;

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
var varStartRegex = new RegExp(identifier, 'gi');
var varPropRegex  = new RegExp(varPropOrFunc, 'gi');

// https://mathiasbynens.be/notes/javascript-identifiers
// We exclude 'let,package,interface,implements,private,protected,public,static,yield' because testing shows Chrome accepts these as valid var names.
var nonVars = 'length,NaN,Infinity,caller,callee,prototype,arguments,true,false,null,undefined,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super'.split(/,/g);

var isStandaloneVar = (code) => {
	return !!code.trim().match(isStandaloneVarRegex);
};
var isStandaloneCall = (code) => {
	// if it starts with a variable followed by ( and has no more than one semicolon.
	code = code.trim();

	// If there's a semicolon other than at the end.
	// TODO: This doesn't account for if there's a semicolon in a string argument to the function.
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
		let currentVar = [], matches;
		currentVar.index_ = []; // track the index of each match within code.
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
					currentVar.push(item);
					currentVar.index_.push(index);
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
		else
			break;
	}

	return result;
};

/**
 * TODO: this function should leave alone anything after a :
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
	let pieces = code.split(/\s*;\s*/g);
	for (let piece of pieces) {
		let [key, value] = piece.split(/\s*:\s*/);
		result[key] = value;
	}
	return result;
};

var joinObj = (obj) => {
	var result = [];
	for (let name in obj)
		result.push (name + ':' + obj[name]);
	return result.join(';');
};

/**
 * Parse "items : item" into two part, always splitting on the last colon.
 * @param code {string}
 * @return {[string, string, string]} foreachCode, loopVar, indexVar (optional) */
var parseLoop = (code) => {
	var result = code.split(/[,:](?=[^:]+$)/).map((x)=>x.trim());
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


var addThis = (code, context, isSimple, prefix) => {
	prefix = prefix || 'this';
	isSimple = isSimple || isStandaloneVar;
	if (!isSimple(code))
		return code;

	// If it starts with this or an item in context, do nothing.
	code = code.trim();
	for (let pre of [prefix, ...Object.keys(context || {})])
		if (code.match(new RegExp('^' + pre + '(\s*[\.[]|$)'))) // starts with "prefix." or "prefix["
			return code;

	return prefix + '.' + code;
};;

/**
 * Create a copy of root, where callback() is called whenever anything within object is added, removed, or modified.
 * Monitors all deeply nested properties including array operations.
 * Inspired by: stackoverflow.com/q/41299642
 * @param root {object}
 * @param callback {function(action:string, path:string[], value:string?)} Action is 'set' or 'delete'.
 * @returns {Proxy} */
var watchObj = (root, callback) => {

	// A map between objects and their string[] path.
	// This is passed to callback whenever a prop changes so we know what changed.
	var paths = new WeakMap();
	paths.set(root, []);

	var handler = {
		/**
		 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
		 * And to keep track of the path as we traverse deeper into an object.
		 * @param obj {Array|object}
		 * @param field {string} An object key or array index.
		 * @returns {*} */
		get(obj, field) {
			if (field==='isProxy')
				return true;
			if (field==='removeProxy')
				return obj;

			//#IFDEV
			if (obj.isProxy)
				throw new XElementError("Double wrapped proxy found.");
			//#ENDIF

			let result = obj[field];

			if (isObj(result)) {

				// Create a new Proxy instead of wrapping the original obj in two proxies.
				// We don't actually want to do this because one prop that has multiple watchers may need to be passed around.
				var innerResult = result;
				if (innerResult.isProxy)
					innerResult = innerResult.removeProxy;

				//#IFDEV
				if (innerResult.isProxy)
					throw new XElementError("Double wrapped proxy found.");
				//#ENDIF

				// Keep track of paths.
				// Paths are built recursively as we descend, by getting the parent path and adding the new field.
				if (!paths.has(innerResult)) {
					let path = paths.get(obj);
					paths.set(innerResult, [...path, field]);
				}

				if (result.isProxy)
					return result;

				// If setting the value to an object or array, also create a proxy around that one.
				return new Proxy(result, handler);
			}
			return result;
		},

		/**
		 * Trap called whenever anything in an array or object is set.
		 * Changing and shifting array values will also call this function.
		 * @param obj {Array|object} root or an object within root that we're setting a property on.
		 * @param field {string} An object key or array index.
		 * @param newVal {*}
		 * @returns {boolean} */
		set(obj, field, newVal) {

			// Don't allow setting proxies on underlying obj.
			// We need to remove them recursivly in case of something like newVal=[Proxy(obj)].

			let path = [...paths.get(obj), field];
			obj[field] = removeProxies(newVal);
			if (field !== 'length')
				callback('set', path, obj[field]);
			return 1; // Proxy requires us to return true.
		},

		/**
		 * Trap called whenever anything in an array or object is deleted.
		 * @param obj {Array|object} root or an object within root that we're deleting a property on.
		 * @param field {int|string} An object key or array index.
		 * @returns {boolean} */
		deleteProperty(obj, field) {
			if (Array.isArray(obj))
				obj.splice(field, 1);
			else
				delete obj[field];
			callback('delete', [...paths.get(obj), field]);
			return 1; // Proxy requires us to return true.
		}
	};

	return new Proxy(root, handler);
};

/**
 * Operates recursively to remove all proxies.  But should it?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @returns {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	while (obj.isProxy) // should never be more than 1 level deep of proxies.
		obj = obj.removeProxy;

	//#IFDEV
	if (obj.isProxy)
		throw new XElementError("Double wrapped proxy found.");
	//#ENDIF

	if (isObj(obj)) {
		if (!visited)
			visited = new WeakSet();
		else if (visited.has(obj))
			return obj;
		visited.add(obj);

		for (let name in obj)
			if (obj.hasOwnProperty(name)) { // Don't mess with inherited properties.  E.g. defining a new outerHTML.
				let t = obj[name];
				let v = removeProxies(t, visited);
				if (v !== t)
					watchlessSet(obj, [name],  v);
			}
	}
	return obj;
};

/**
 * Allow subcribing only to specific properties of an object.
 * Internally, the property is replaced with a call to Object.defineProperty() that forwards to
 * a proxy created by watchObh() above. */
class WatchProperties {

	constructor(obj) {
		this.obj_ = obj;   // Original object being watched.
		this.fields_ = {}; // removeProxy underlying fields that store the data.
		                   // This is necessary to store the values of obj_ after defineProperty() is called.
		this.proxy_ = watchObj(this.fields_, this.notify.bind(this));
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=} */
	notify(action, path, value) {

		// Traverse up the path looking for anything subscribed.
		var parentPath = path.slice(0, -1);
		while (parentPath.length) {
			let cpath = csv(parentPath); // TODO: This seems like a lot of work for any time a property is changed.

			if (cpath in this.subs_)
				for (let callback of this.subs_[cpath])
					callback.apply(this.obj_, arguments) // "this.obj_" so it has the context of the original object.
			parentPath.pop();
		}

		// Traverse to our current level and downward looking for anything subscribed
		let jpath = csv(path);
		for (let name in this.subs_)
			if (name.startsWith(jpath))
				for (let callback of this.subs_[name])
					callback.apply(this.obj_, arguments); // "this.obj_" so it has the context of the original object.
	}

	/**
	 *
	 * @param path {string|string[]}
	 * @param callback {function((action:string, path:string[], value:string?)} */
	subscribe(path, callback) {
		if (typeof path === 'string')
			path = parseVars(path)[0]; // TODO subscribe to all vars?

		// Create property at top level path, even if we're only watching something much deeper.
		// This way we don't have to worry about overriding properties created at deeper levels.
		var self = this;
		var field = path[0];
		if (!(field in self.fields_)) {
			self.fields_[field] = self.obj_[field];

			// If we're subscribing to something within the top-level field for the first time,
			// then define it as a property that forward's to the proxy.
			delete self.obj_[field];
			Object.defineProperty(self.obj_, field, {
				enumerable: 1,
				configurable: 1,
				get: () => {
					return self.proxy_[field];
				},
				set: (val) => {
					return self.proxy_[field] = val;
				}
			});
		}

		// Create the full path if it doesn't exist.
		traversePath(this.fields_, path, 1); // TODO: Do we have to create it?

		// Add to subscriptions
		let cpath = csv(path);
		if (!(cpath in self.subs_))
			self.subs_[cpath] = [];
		self.subs_[cpath].push(callback);
	}

	unsubscribe(path, callback) {

		// Make sure path is an array.
		if (typeof path === 'string')
			path = JSON.parse('[' + path + ']');

		// Remove the callback from this path and all parent paths.
		let cpath = csv(path);
		if (cpath in this.subs_) {

			// Remove the callback from the subscriptions
			if (callback) {
				let callbackIndex = this.subs_[cpath].indexOf(callback);
				this.subs_[cpath].splice(callbackIndex, 1); // splice() modifies array in-place
			}

			// Remove the whole subscription array if it's empty.
			if (!callback || !this.subs_[cpath].length)
				delete this.subs_[cpath];

			// Undo the Object.defineProperty() call when there are no more subscriptions to it.
			let propCpath = csv([path[0]]);
			if (!keysStartWith(this.subs_, propCpath).filter((x) => x.length).length) {

				delete this.obj_[path[0]]; // Remove the defined property.
				this.obj_[path[0]] = this.fields_[path[0]];

				delete this.fields_[path[0]];
			}
		}
	}
}


// Keeps track of which objects we're watching.
// That way watch() and unwatch() can work without adding any new fields to the objects they watch.
var watched = new WeakMap();

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function(action:string, path:string[], value:string?)} */
var watch = (obj, path, callback) => {
	if (obj.isProxy)
		obj = obj.removeProxy;

	var wp;
	if (!watched.has(obj)) {
		wp = new WatchProperties(obj);
		watched.set(obj, wp);
	}
	else
		wp = watched.get(obj);

	wp.subscribe(path, callback);
};

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
var unwatch = (obj, path, callback) => {
	var wp = watched.get(obj);

	if (wp) {
		if (path)
			wp.unsubscribe(path, callback);
		else
			for (let sub in wp.subs_)
				wp.unsubscribe(sub);

		// Remove from watched objects if we're no longer watching
		if (!Object.keys(wp.subs_).length)
			watched.delete(obj);
	}
};

/**
 * This function is unused.
 * Get a property from a watched object, bypassing the proxy.
 * If the returned value is changed, no callbacks will be called.
 * @param obj {object}
 * @param path {string[]}
 * @returns {*} */
/*
function watchlessGet(obj, path) {
	let node = watched.get(obj).fields_;
	for (let p of path) {
		node = node[p];
		if (node.isProxy)
			throw new XElementError();
	}
	return node;
}
*/

var watchlessSet = (obj, path, val) => {
	// TODO: Make this work instead:
	// Or just use removeProxy prop?
	//traversePath(watched.get(obj).fields_, path, true, val);
	//return val;
	var wp = watched.get(obj);


	let node = wp ? wp.fields_ : obj;
	let prop = path.slice(-1)[0];
	for (let p of path.slice(0, -1)) {
		node = node[p];
		//#IFDEV
		// This can happen if one XElement subscribes within the path of another XElement via data-bind?
		//if (node.isProxy) // optional sanity check
		//	throw new XElementError('Variable ' + p + ' is already a proxy.');
		//#ENDIF

		if (node.isProxy)
			node = node.removeProxy;
	}

	return node[prop] = val;
};;

/*
Inherit from XElement to create custom HTML Components.


TODO
Make data- prefix optional.
Fix failing Edge tests.
Separate "this" binding for data attr on definition vs instantiation.
Make shadowdom optional.
indexOf and includes() on arrays fail because they compare proxied objects.

allow sortable?
implement other binding functions.
allow loop over slots if data-loop is on teh instantiation.
allow loop over more than one html tag.
cache results of parseVars() and other parse functions?
cache the context of loop vars.
functions to enable/disable updates.
function to trigger updates?

create from <template> tag
When a change occurs, create a Set of functions to call, then later call them all.
	That way we remove some duplicate updates.
Auto bind to this in complex expressions if the class property already exists and the var is otherwise undefined?
improve minifcation.
speed up data-loop by only modifying changed elements for non-simple vars.
Expose bindings prop in minified version.
non-ascii variable names.
throttle, debounce?
Auto two-way bind for simple variables?
bind to <input type="file">
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
	This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
TODO:

We could even add enableUpdates() / disableUpdates() / clearUpdates() functions.




Disadvantages of Vue.js
10x larger.
Requires a single, special root component everything else must be within.
Doesn't use es6 classes.
Requires data and methods, can't bind directly to class props.
Doesn't support ShadowDOM, only emulates nested styles.
Requires key="" attributes everywhere to make identical elements unique.
Vue.js doesn't watch array indices or object property add/remove!
   You have to call Vue.set(array...)
data: {} items shared between each component instance, unless it's wrapped in a function.

Advantages of Vue.js
Fast and debugged.
Widespread use.
IDE support
---
{{ templates }} for plain text.
transition effects
Automatically adds vendor prefixes for data-styles="" binding.
key/value iteration over objects.
Checkboxes and multi-select to array of names.
lazy modifier for input binding, to only trigger update after change.

*/



// A map between elements and the callback functions subscribed to them.
// This way when we remove an element we know what to unbind.
var watchedEls = new WeakMap();

var addWatchedEl = (el, callback) => {
	if (!watchedEls.has(el))
		watchedEls.set(el, [callback]);
	else
		watchedEls.get(el).push(callback);
};


/**
 * @param cls {Function}
 * @returns {string} */
var getXName = (cls) => {
	if (!cls.xname) {
		let lname = cls.name.toLowerCase();
		if (lname.startsWith('x'))
			lname = lname.slice(1);

		let name = 'x-' + lname;

		// If name exists, add an incrementing integer to the end.
		for (let i = 2; customElements.get(name); i++)
			name = 'x-' + lname + i;

		cls.xname = name;
	}
	return cls.xname;
};

var getXParent = (el) => {
	do {
		if (el.nodeType === 11) // doc fragment
			return el.host;
	} while (el = el.parentNode);
};

/**
 * Traverse through all parents to build the loop context.
 * This will return an incorrect result if called on a nested loop element.
 * Because the outer loop must be processed and build before we know the index for the inner element.
 * TODO: We could maybe speed things up by having a weakmap<el, context:object> that caches the context of each loop?
 * @param el
 * @return {object<string, string|int>} */
var getContext = (el) => {
	let context = {};
	let parent = el;
	let lastEl = el;

	// Parent.host lets us traverse up beyond the shadow root, 
	// in case data-loop is defined on the shadow host.
	// We also start by checking the parent for the context instead of this element,
	// because an element only sets its context for its children, not itself.
	while (parent = (parent.host || parent.parentNode)) {

		// Shadow root documnet fragment won't have getAttrbute.
		let code = parent.getAttribute && parent.getAttribute('data-loop');
		if (code) {

			// Check for an inner loop having the same variable name
			let [foreach, itemVar, indexVar] = parseLoop(code);
			foreach = addThis(foreach);

			//#IFDEV
			if (itemVar in context)
				throw new XElementError('Loop variable "' + itemVar + '" already used in a parent loop.');
			if (indexVar && indexVar in context)
				throw new XElementError('Loop index "' + indexVar + '" already used in a parent loop.');
			//#ENDIF

			// As we traverse upward, we set the index of variables.
			if (lastEl) {
				let index = parentIndex(lastEl);
				context[itemVar] = foreach + '[' + index + ']';
				if (indexVar) // will be undefined if it doesn't exist.
					context[indexVar] = index;
			}
		}

		// If not a DocumentFragment from the ShadowRoot.
		if (parent.getAttribute)
			lastEl = parent;

		// Stop once we reach an XElement.
		if (parent.bindings)
			break;
	}
	return context;
};


/**
 * Recursively process all the data- attributes in el and its descendants.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=} A map of loop variable names to their absolute reference.
 * This allows us to do variable replacement:
 *     <div>data-loop="this.items : item">
 *         <div data-val="item.name">
 *  The looped item becomes:
 *         <div data-val="this.items[0].name"> */
var bindEl = (self, el, context) => {
	var foreach, item, indexVar;


	// Seach attributes for data- bindings.
	if (el.attributes) // shadow root has no attributes.
		for (let attr of el.attributes) {
			if (attr.name.slice(0, 5) === 'data-') {

				let attrName = attr.name.slice(5); // remove data- prefix.
				let code = attr.value;

				// Get context only if needed.
				if (!context)
					context = getContext(el);

				// Replace loopVars
				// We do this here instead of in the bind function so we can build the context as we descend.
				if (attrName === 'loop') { // only the foreach part of a data-loop="..."

					// Replace vars only in the part of the foreach loop before the ":"
					// This is necessary for inner nested loops.
					[foreach, item, indexVar] = parseLoop(code);
					foreach = replaceVars(foreach, context);
					foreach = addThis(foreach, context);
				}

				if (bindings[attrName])
					bindings[attrName](self, code, el, context);

				//#IFDEV
				else
					throw new Error (attrName);
				//#ENDIF
			}
		}

	// Allow traversing from host element into its own shadowRoot
	// But not into the shadow root of other elements.
	let root = el;
	if (el===self && el.shadowRoot)
		root = el.shadowRoot;

	for (let i=0; i < root.children.length; i++) {

		// Add to context as we descend.
		// This seems only needed to soupport nested loops?
		if (foreach) {
			context[item] = foreach + '[' + i + ']';
			if (indexVar !== undefined)
				context[indexVar] = i;
		}

		bindEl(self, root.children[i], context);
	}

	// Remove the loop context after we traverse outside of it.
	if (item)
		delete context[item];
};



/**
 * @param root {HTMLElement} Remove all bindings within root and children.*/
var unbindEl = (root) => {

	var els = [...root.querySelectorAll('*')];
	if (root.attributes)
		els.unshift(root);

	for (let el of els) {

		for (let attr of el.attributes) {
			if (attr.name.slice(0, 5) === 'data-') {
				let callbacks = watchedEls.get(el) || [];
				if (callbacks.length) {
					let code = attr.value;
					var context = context || getContext(el);

					if (attr.name === 'data-loop') // get vars from only the foreach part of a data-loop="..."
						code = parseLoop(code)[0];

					code = replaceVars(code, context);
					let paths = parseVars(code); // TODO this will not property parse classes, attribs, and data-bind.

					for (let path of paths)
						// watchedEls.get() returns callbacks from all paths, but unwatch only unsubscribes those of path.
						for (let callback of callbacks || []) {
							var self = self || getXParent(root);
							unwatch(self, path, callback);
						}
				}
			}
		}
	}
};

/**
 * We rebind event attributes because otherwise there's no way
 * to make them call the class methods.
 * @param self {XElement}
 * @param root {HTMLElement} */
var bindEvents = (self, root) => {

	var els = [...root.querySelectorAll('*')];
	if (root.attributes)
		els.unshift(root); // Add root if it's not a DocumentFragment from shadowDOM

	// Traverse through every child element.
	// TODO: Don't descend into other xelements once we make shadowdom optional.
	for (let el of els) {
		bindElEvents(self, el);
	}
};

var bindElEvents = (self, el, getAttributesFrom) => {
	getAttributesFrom = getAttributesFrom || el;

	for (let event_ of events) {

		let code = getAttributesFrom.getAttribute('on' + event_);
		if (code) {

			let context = getContext(el);
			code = replaceVars(code, context);

			// If it's a simple function that exists in the class,
			// add the "this" prefix.
			let path = parseVars(code, 0, 1)[0];
			if (path && traversePath(self, path) instanceof Function)
				code = addThis(code, context, isStandaloneCall);

			// The code in the attribute can reference:
			// 1. event, assigned to the current event.
			// 2. this, assigned to the class instance.
			el.addEventListener(event_, function (event) {
				eval(code);
			}.bind(self));

			// Remove the original version so it doesn't also fire.
			el.removeAttribute('on' + event_);
		}
	}
};


var setAttribute = (self, name, value) => {

	// Copy to class properties.
	// This doesn't work because the properties aren't created until after initHtml() is called.
	if (!isValidAttribute(self, name)) {

		// As javascript code to be evaluated.
		if (value && value.length > 2 && value.slice(0, 1) === '{' && value.slice(-1) === '}') {
			(() => { // Guard scope before calling eval.
				value = eval('(' + value.slice(1, -1) + ')'); // code to eval
			}).call(self); // Import "self" as "this" variable to eval'd code.  This lets us pass attribute="${this}" in html initialization.
		}
		else
			self[name] = value;
	}

	// Copy attribute as an attribute.
	else
		self.setAttribute(name, value);
};


var initHtml = (self) => {
	if (self.init_)
		return;
	self.init_ = 1;

	// 1. Create temporary element.
	var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'

	// 2. Remove and save attributes from instantiation.
	var attributes = {};
	for (let attr of self.attributes) // From instantiation.
		attributes[attr.name] = attr.value;

	// 3.  Add attributes from definition (Item.html='<div attr="value"')
	for (let attr of div.attributes) { // From definition
		if (attr.name !== undefined)
			setAttribute(self, attr.name, attr.value);
	}

	// 4. Bind events on the defintion to functions on its own element and not its container.
	bindElEvents(self, self, div);

	// 5.  Add attributes from instantiation.
	for (let name in attributes) // From instantiation
		setAttribute(self, name, attributes[name]);

	// 6. Create Shadow DOM
	self.attachShadow({mode: 'open'});
	while (div.firstChild)
		self.shadowRoot.appendChild(div.firstChild);
	var root = self.shadowRoot || self;


	/*
	// Old version before shadow dom:
	// Html within <x-classname>...</x-classname>, where the tag is added to another element.
	// This only works in the Edge shim.  It's an empty string in chrome and firefox.
	var slotHtml = self.innerHTML;
	var slot = div.querySelector('#slot');
	if (slot)
		slot.removeAttribute('id');

	// Copy children from temporary div to this class.
	if (slot || !slotHtml) {
		self.innerHTML = '';
		while (div.firstChild)
			self.appendChild(div.firstChild);
	}

	// Copy children from <x-classname> into the slot.
	if (slotHtml)
		(slot || self).innerHTML = slotHtml;
	*/



	// 7. Create class properties that reference any html element with an id tag.
	var nodes = root.querySelectorAll('[id]');
	for (let i = 0, node; node = nodes[i]; i++) {
		let id = node.getAttribute('id');
		Object.defineProperty(self, id, {
			// Make it readonly.
			// Using writeable: false caused errors if the getter returns a proxy instead of the proper type.
			// But how does it know it's the wrong type?

			enumerable: 1,
			configurable: 1,
			get: function() {
				return node;
			},
			set: function() {
				//#IFDEV
				throw new XElementError('Property ' + id + ' not writable');
				//#ENDIF
			}
		});

		// Only leave the id attributes if we have a shadow root.
		// Otherwise we'll have duplicate id's in the main document.
		if (!self.shadowRoot)
			node.removeAttribute('id');
	}




	// 8. Bind all data- and event attributes
	// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation.
	//if (!self.hasAttribute('data-bind'))
	bindEl(self, self);
	bindEvents(self, root);

};

/**
 * Inherit from this class to make a custom HTML element.
 * If you extend from XElement, you can't instantiate your class unless you first set the html property.
 * This is because XElement extends from HTMLElement, and setting the .html property calls customElements.define(). */
class XElement extends HTMLElement {

	constructor() {
		//#IFDEV
		try {
		//#ENDIF
			super();
		//#IFDEV
		} catch (error) {
			if (error instanceof TypeError) // Add helpful message to error:
				error.message += '\nMake sure to set the .html property before instantiating the class "' + this.name + '".';
			throw error;
		}
		//#ENDIF

		let xname = getXName(this.constructor);
		let self = this;
		if (customElements.get(xname))
			initHtml(self);
		else
			customElements.whenDefined(xname).then(() => {
				initHtml(self);
			});
	}
}

// TODO: write a function to replace common code among these.
var bindings = {

	/**
	 * When self.field changes, update the value of <el attr>.
	 * This binding is used if one of the other names above isn't matched.
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	attribs: (self, code, el, context) => {
		var obj = parseObj(code);
		for (let name in obj) {
			let attrExpr = addThis(replaceVars(obj[name], context), context);

			let setAttr = function (/*action, path, value*/) {
				var result = safeEval.call(self, attrExpr);
				if (result === false || result === null || result === undefined)
					el.removeAttribute(name);
				else
					el.setAttribute(name, result + '');

			}.bind(self);

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(attrExpr)) {
				watchXElement(self, path, setAttr);
				addWatchedEl(el, setAttr);
			}

			setAttr();
		}
	},


	bind: (self, code, el, context) => {
		if (!(self !== el && el instanceof XElement))
			return;


		// Temporary.  Put this in its own function or something.
		var obj = parseObj(code);

		for (let prop in obj) {

			// Assign the referenced object to a variable on el.
			let expr = addThis(replaceVars(obj[prop], context), context);

			let updateProp = function updateProp(action, path, value) {
				el[prop] = safeEval.call(self, expr);
			}.bind(self);


			// Set initial values.
			updateProp();

			// If binding to the parent, "this", we need to take extra steps,
			// because normally we can only bind to object properties and not the object itself.
			if (expr === 'this') {

				// 1. We get the subscriptions that watch the property on el.
				let subs = watched.get(el).subs_;

				for (let sub in subs) {
					if (sub.startsWith('"' + prop + '"')) {
						let subPath = JSON.parse('[' + sub + ']');

						// 2. For each function, we move the watch from the child object to the parent object.
						for (let callback of subs[sub]) {
							unwatch(el, subPath, callback);
							watch(self, subPath.slice(1), function (action, path, value) {
								// 3. And intercept its call to make sure we pass the original path.
								callback.call(el, action, subPath, value);
							});
						}
					}
				}
			}

			// Add a regular watch.
			else
				for (let path of parseVars(expr))
					watchXElement(self, path, updateProp);
		}

	},

	classes: (self, code, el, context) => {

		// Temporary.  Put this in its own function or something.
		var obj = parseObj(code);
		for (let name in obj) {
			let classExpr = addThis(replaceVars(obj[name], context), context);

			// This code is called on every update.
			let updateClass = function () {
				let result = safeEval.call(self, classExpr);
				if (result)
					el.classList.add(name);
				else {
					el.classList.remove(name);
					if (!el.classList.length) // remove attribute after last class removed.
						el.removeAttribute('class');
				}
			}.bind(self);


			// Create properties and watch for changes.
			for (let path of parseVars(classExpr)) {
				//traversePath(self, path, true); // Create properties.
				watch(self, path, updateClass);
			}

			// Set initial values.
			updateClass();
		}


	},

	text: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setText = function setText(action, path, value) {
			//debugger;
			el.textContent = safeEval.call(self, code);
		};
		for (let path of parseVars(code)) {
			watchXElement(self, path, setText);
			addWatchedEl(el, setText);
		}

		// Set initial value.
		setText();
	},

	html: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setHtml = function setHtml(action, path, value) {
			el.innerHTML = safeEval.call(self, code);
		};

		for (let path of parseVars(code)) {
			watch(self, path, setHtml);
			addWatchedEl(el, setHtml);
		}

		// Set initial value.
		setHtml();
	},



	loop: (self, code, el, context) => {

		// Allow loop attrib to be applied above shadowroot.
		el = el.shadowRoot || el;



		// Parse code into foreach parts
		var [foreach] = parseLoop(code);


		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);
		var paths = parseVars(foreach);
		var isSimple = isStandaloneVar(foreach);

		// The code we'll loop over.
		// We store it here because innerHTML is lost if we unbind and rebind.
		if (!el.loopHtml)
			el.loopHtml = el.innerHTML.trim();


		var getModifiedIndex = (path) => {
			// Can't calc for non-simple var.
			// Can't calc if path doesn't match simple var path.
			if (!isSimple || !arrayEq(path.slice(0, -1), paths[0]))
				return -1;

			return parseInt(path[path.length-1]);
		};

		function rebuildChildren(action, path, value) {

			// TODO: Keep all elements the same and only update bound values?
			// Then we only need to add and remove items from the end of the children.
			// But this would break unbound inputs when removing from the middle of the list.

			if (path) {
				// We're modifying something inside an element, don't rebuild the whole array.
				// Data binding within the element will handle these changes.
				if (path.length > paths[0].length + 1)
					return;

				var index = getModifiedIndex(path);
			}

			// If code is a simple var and path modifies only one item:
			if (path && index >= 0) {
				let existingChild = el.children[index];

				// Unbind needs to happen before existing child changes its index.
				if (existingChild) // action==='delete' or removing item replaced by set.
					unbindEl(existingChild);


				if (action === 'set') { // add or replace item.
					let newChild = createEl(el.loopHtml);
					el.insertBefore(newChild, existingChild); // if existingChild is null, will be inserted at end.
					bindEl(self, newChild);
					bindEvents(self, newChild);
				}

				if (existingChild) { // action==='delete' or removing item replaced by set.
					// Calling unbindEl() makes unit tests fail, not sure why.
					//unbindEl(existingChild);
					el.removeChild(existingChild);
				}
			}

			// Otherwise we have to rebuild all children.
			else {

				// Remove all children.
				while (el.lastChild) {
					if (el.lastChild.nodeType === 1)
					// If we don't unbind, changing the array will still updated these detached elements.
					// This will cause errors because these detached elements can't traverse upward to find their array contexts.
					// TODO: unbindEvents()?
						unbindEl(el.lastChild);

					el.removeChild(el.lastChild);
				}

				// Recreate all children.
				if (el.loopHtml.length) {
					let result = safeEval.call(self, foreach);

					for (let i in result) {
						let child = createEl(el.loopHtml);
						el.appendChild(child);

						bindEl(self, child);
						bindEvents(self, child);
					}
				}
			}
		}

		// Remove children before calling rebuildChildren()
		// That way we don't unbind elements that were never bound.
		while (el.lastChild)
			el.removeChild(el.lastChild);

		for (let path of paths) {
			watchXElement(self, path, rebuildChildren);

			addWatchedEl(el, rebuildChildren);
		}

		// Set initial children
		rebuildChildren.call(self);
	},

	// Special 2-way binding
	val: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);

		// Update object property when input value changes, only if a simple var.
		var paths = parseVars(code);
		if (paths.length === 1 && isStandaloneVar(code))
			el.addEventListener('input', () => {
				let value;
				if (el.getAttribute('type') === 'checkbox')
					value = el.checked;
				else
					value = el.value || el.innerHTML || ''; // works for input, select, textarea, [contenteditable]

				// We don't use watchlessSet in case other things are subscribed.
				traversePath(self, paths[0], true, value);
			});

		let setVal = function(action, path, value) {
			let result = safeEval.call(self, code);

			if (el.getAttribute('type') === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else
				el.value = result;
		}.bind(self);

		// Update input value when object property changes.
		for (let path of paths) {
			watchXElement(self, path, setVal);
			addWatchedEl(el, setVal);
		}

		// Set initial value.
		setVal();
	},

	visible: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		var displayNormal = el.style.display;
		if (displayNormal === 'none')
			displayNormal = '';

		let setVisible = function(/*action, path, value*/) {
			el.style.display = safeEval.call(self, code) ? displayNormal : 'none';
		}.bind(self);
		for (let path of parseVars(code)) {
			watch(self, path, setVisible);
			addWatchedEl(el, setVisible);
		}

		// Set initial value.
		setVisible();
	},

	/*
	'style': function(self, field, el) {}, // Can point to an object to use for the style.
	'if': function(self, field, el) {}, // Element is created or destroyed when data-if="code" evaluates to true or false.
	'sortable': // TODO use sortable.js and data-sortable="{sortableOptionsAsJSON}"
	*/
};


/**
 * Traverse starting from path and working downward,
 * looking for an existing XElement to watch.
 * This allows the corret object to be watched when data-bind is used.
 * @param obj
 * @param path
 * @param callback */
function watchXElement(obj, path, callback) {
	for (let i=path.length; i>=0; i--) {
		let item = traversePath(obj, path.slice(0, i));
		if (item instanceof XElement) {
			watch(item, path.slice(i), callback);
			break;
		}
	}
}

/**
 * Override the static html property so we can call customElements.define() whenever the html is set.*/
Object.defineProperty(XElement, 'html', {
	get: function () {
		return this.html_;
	},
	set: function (html) {
		const self = this;

		// TODO: We want to be able to do:
		// <x-item arg1="1", arg2="2">
		// And have those passed to Item's constructor.
		// Here we can get the names of those arguments, but how to intercept the browser's call to the constructor?
		// Below I tried to work around this by subclassing.
		// But we can't get a reference to the <x-item> to read its attributes before the super() call.
		// function getConstructorArgs(func) {
		// 	return func.toString()  // stackoverflow.com/a/14660057
		// 		.replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg,'') // Remove comments. TODO: Also remove strings.
		// 		.match(/^\s*constructor\s*\(\s*([^)]*)\)\s*{/m)[1] // submatch "constructor(...) {"
		// 		.split(/\s*,\s*/);
		// }
		// var args = getConstructorArgs(this);
		//
		// class Embedded extends this {
		// 	constructor() {
		// 		var attrib0 = this.getAttribute(args[0]); // fails.  Can't use "this".
		// 		super(attrib0);
		// 	}
		// }

		// Could the customElements.whenDefined() callback be helpful?

		let name = getXName(self);

		// New way where we pass attributes to the constructor:
		// customElements.define(name, Embedded);
		// customElements.define(name+'-internal', this);

		// Old way:
		customElements.define(name, self);

		return self.html_ = html;
	}
});

// Exports
XElement.bindings = bindings;
window.XElement = XElement;
})();