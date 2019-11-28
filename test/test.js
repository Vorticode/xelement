/**
 * Functions for JavaScript unit testing.
 * TODO: Support nested tests that collapse in the table.
 */

class AssertError extends Error {
	constructor(message) {
		super(message);
		this.name = "AssertError";
	}
}

function assert(val) {
	if (!val)
		throw new AssertError(val);
}

function assertEq(val1, val2) {
	if (val1 !== val2)
		throw new AssertError(val1 + ' !== ' + val2);
}

function assertNeq(val1, val2) {
	if (val1 !== val2)
		throw new AssertError(val1 + ' === ' + val2);
}

/**
 * A set of functions for running tests. */
var Tests = {

	/**
	 * Find all top level and object member functions that begin with startsWith.
	 * And also all functions of any object's whose name begins with startsWith.
	 * @param startsWith {string}
	 * @param obj {object=} Used for recusion.  Leave this blank.
	 * @returns {object<string, function>} */
	find: function(startsWith, obj) {
		if (!obj) {
			Tests.find.objs = new WeakSet();
			obj = window;
		}
		var result = {};

		// Skip objects we've already traversed.
		// Otherwise circular references will lead to a stack overflow.
		if (!Tests.find.objs.has(obj)) {
			Tests.find.objs.add(obj);

			for (let name in obj) {

				// avoid deprecated msg in chrome
				if (['webkitStorageInfo', 'webkitIndexedDB'].includes(name))
					continue;

				// If a member's name matches startsWith
				let val = obj[name];
				if ((val instanceof Function) && name.startsWith(startsWith))
					result[name] = val;

				// If member is an object, recurse:
				else if (isObj(val)) {

					// If the object's name matches startsWith, include all of its functions.
					// Otherwise only include its functions that match startsWith.
					//var startsWith2 = name.startsWith(startsWith) ? '' : startsWith;
					if (name.startsWith(startsWith)) {
						var result2 = Tests.find('', val);
						for (let name2 in result2)
							result[name + '.' + name2] = result2[name2];
					}
				}
			}
		}
		return result;
	},

	/**
	 * @returns {string[]} */
	getEnabled: function() {
		return window.location.search.substr(1)
			.split(/&/g)
			.filter((x) => x.endsWith('=1') )
			.map((x) => x.substr(0, x.length-2) );
	},

	/**
	 * Prints output to cells created by getTable() if they exist,
	 * otherwise prints to console.
	 * @param testNames {string[]} */
	run: function(testNames) {
		for (let testName of testNames) {
			var output = document.getElementById(testName);
			//try {
				eval(testName + '()');
				if (output)
					output.innerHTML = '<div class="pass">Passed</div>';
				else
					console.log(testName + ': Passed');

			/*
			}
			catch (e) {
				if (e instanceof AssertError) {
					if (output)
						output.innerHTML = '<div class="fail">' + Tests.stack(e) + '</div>';
					else
						console.error(testName + ': Failed\n' + Tests.stack(e));
				}
				else
					throw e;
			}*/
		}
	},

	/**
	 * @param testNames {string[]}
	 * @returns {HTMLTableElement|Element} */
	getTable: function(testNames) {
		var table = document.createElement('table');
		var enabled = Tests.getEnabled();

		// StringBuilder
		var html = ['<tr><th style="text-align: left"><input type="checkbox" ' +
			'onclick="this.parentNode.parentNode.parentNode.querySelectorAll(\'[type=checkbox]\').forEach((x) => x.checked=this.checked)"></th>'];
		for (let testName of testNames) {
			var checked = enabled.includes(testName) ? 'checked' : '';
			html.push(
				'<tr>' +
					'<td><label>' +
						'<input name="' + testName + '" type="checkbox" value="1" ' + checked + '>' +
						testName +
					'</label></td>' +
					'<td id="' + testName + '"></td>' +
				'</tr>');
		}

		table.innerHTML = html.join('');
		return table;
	},


	/**
	 * @param text {string}
	 * @returns {string} */
	escapeHtml: function(text) { // From stackoverflow.com/a/4835406
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
	},

	stack: function(e) {
		if (!e.stack)
			return '';

		var stack = e.stack.split(/\n/); // Remove the liteunit.php lines from the stack trace.
		//stack = stack.slice(0, 1).concat(stack.slice(2));
		var stack2 = [];
		for (var i=0; i<stack.length; i++)
			if (stack[i].indexOf('/liteunit.php?') === -1) // remove frames that are inside liteunit.php
				stack2.push(stack[i]);
		stack = stack2.join('\n');
		return Tests.escapeHtml(stack).replace(/\n/g, '<br/>');
	}
};



/*

// Test Watch:
var tree = {
	a: [1, 2, 3],
	b: 2
};

var callback = function() {
	console.log(arguments);
};
var a = tree.a;
watch(tree, 'a', callback);
a.push(5);
tree.a.push(4);

unwatch(tree, 'a', callback);
*/