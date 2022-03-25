/**
 * Functions for JavaScript unit testing.
 */

class AssertError extends Error {
	constructor(message) {
		super(message);
		this.name = "AssertError";
	}
}

function assert(val) {
	if (!val) {
		if (LiteUnit.debugOnAssertFail)
			debugger;
		throw new AssertError(val);
	}
}

assert.eq = (val1, val2) => {
	if (val1 !== val2) {
		if (LiteUnit.debugOnAssertFail)
			debugger;
		throw new AssertError(val1 + ' !== ' + val2);
	}
};
var assertEq = assert.eq;

assert.eqDeep = (val1, val2) => {
	if (val1 === val2)
		return true;
	if (JSON.stringify(val1) === JSON.stringify(val2))
		return true;

	if (LiteUnit.debugOnAssertFail)
		debugger;
	throw new AssertError(val1 + ' !== ' + val2);
};

var assertEqDeep = assert.eqDeep;

function assertNeq(val1, val2) {
	if (val1 !== val2) {
		if (LiteUnit.debugOnAssertFail)
			debugger;
		throw new AssertError(val1 + ' === ' + val2);
	}
}

function assertLte(val1, val2) {
	if (val1 > val2) {
		if (LiteUnit.debugOnAssertFail)
			debugger;
		throw new AssertError(val1 + ' > ' + val2);
	}
}

var Mock = {

	// doesn't work at all.
	iframe: function(callback) {

		var iframe = document.createElement('iframe');
		iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
		iframe.setAttribute('src', 'about:blank');
		var html = '<body></body>';
		iframe.src = 'data:text/html;charset=utf-8,' + encodeURI(html);
		document.body.appendChild(iframe);
		setTimeout(function() {

			var result = callback();
			iframe.contentWindow.parent.postMessage(result);
			//console.log('iframe.contentWindow =', iframe.contentWindow);

		}, 300);

	}

};

var createEl = (html) => {
	if (!createEl.cache)
		createEl.cache = {};

	let existing = createEl.cache[html];
	if (existing)
		return existing.cloneNode(true);


	//#IFDEV
	if (typeof html !== 'string')
		throw new Error('Html argument must be a string.');
	//#ENDIF

	let tagName = html.trim().match(/<([a-z0-9-]+)/i);
	if (tagName)
		tagName = tagName[1];

	// Using a template makes some embed related tests fail to instantiate x-elements.
	let parentMap = {
		td: 'tr',
		tr: 'tbody',
		tbody: 'table',
		thead: 'table',
		tfoot: 'table',
		source: 'video',
		area: 'map',
		legend: 'fieldset',
		option: 'select',
		col: 'colgroup',
		param: 'object'
	};
	let parentTag = parentMap[tagName] || 'div';

	var parent = document.createElement(parentTag);
	parent.innerHTML = html;
	var result = parent.removeChild(parent.firstChild);

	createEl.cache[html] = result.cloneNode(true);
	return result; // clone so that subsequent changes don't break our cache.
};


var LiteUnitTable = {


	/**
	 *
	 * @param testObj {object<string, function|object>}
	 * @param testPath {string}
	 * @returns {HTMLTableRowElement[]} */
	createRows(testObj, testPath) {
		var result = [];

		for (let testName in testObj) {
			let test = testObj[testName];

			let testPathName = testPath + '.' + testName;

			let tr = createEl(
				`<tr data-test="` + testPathName + `">
					<td>
						<label>
							<input type="checkbox" name="` + testPathName + `">` + testName + `	
						</label>
					</td>
					<td class="result"></td>
				</tr>`);

			result.push(tr);


			if (typeof test === 'object') {

				// 1.  Add expand button to previous tr.
				// TODO

				// 2. Add another row with a table of the children.
				let tr = createEl(
					`<tr>
						<td colspan="2">
							<table class="indent"></table>
						</td>
					</tr>`);
				var table = tr.children[0].children[0];


				let trs = LiteUnit.tableCreateRows(test); // Recurse
				for (let tr of trs)
					table.appendChild(tr);

				result.push(tr);
			}
			else if (typeof test === 'function') {


			}
		}
		return result;
	},


	getEnabledTests() {

	},

	getExpandedTests() {

	}

};


/**
 * A set of functions for running tests. */
var LiteUnit = {

	debugOnAssertFail: false,
	debugOnError: false,
	throwError: false,
	expandLevel: 2,



	getIntArg: function(name, def) {
		name = name.replace(/ /g, '+');

		let allArgs = window.location.search.substr(1)
			.split(/&/g);

		for (let arg of allArgs) {
			let [argName, val] = arg.split('=');
			if (argName === name)
				return parseInt(val);
		}
		return def;
	},



	toggleTest: function(e) {
		// Skip if we clicked a link.
		if (e.target.tagName === 'A')
			return;

		let tr = e.currentTarget.parentNode;

		// Toggle our own checkbox.
		let checkbox = e.currentTarget.querySelector('[type=checkbox]');
		if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') // if clicked other than checkbox
			checkbox.checked = !checkbox.checked;

		// Toggle our own tr element
		tr.className = checkbox.checked ? 'selected' : '';

		// Toggle the child tr elements and checkboxes
		var nextTr = tr.nextSibling;
		if (nextTr) {
			var subTable = nextTr.querySelector('table');
			if (subTable) {
				subTable.querySelectorAll('input.enabled').forEach((x) => x.checked = checkbox.checked);
				subTable.querySelectorAll('tr').forEach((x) => x.className = checkbox.checked ? 'selected' : '');
			}
		}
	},

	toggleExpand: function(e) {
		let tr = e.target.parentNode.parentNode;

		var nextTr = tr.nextSibling;
		let expand = false;
		if (nextTr) {
			var subTable = nextTr.querySelector('table');
			if (subTable) {
				expand = subTable.style.display === 'none';
				subTable.style.display = expand ? '' : 'none';
			}
		}

		tr.querySelector('input.expand').checked = expand;
	},









	/**
	 * Get the html to print a table of tests.
	 * @param testObj {object<string, function|object>}
	 * @param testName {string=}
	 * @param level {string[]=}
	 * @returns {[string[], int, int]} */
	getTable: function(testObj, testName, level) {
		testName = testName || 'All Tests';
		level = level || [testName];

		// StringBuilder
		var html = [];

		let val = testObj;

		let checked = LiteUnit.getIntArg(testName);
		let checkedAttr = checked ? 'checked' : '';
		let selected = checked ? 'selected' : '';

		let dataTest = '';
		if (typeof val === 'function')
			dataTest = 'data-test="' + level.join('.') + '"';

		let type = typeof val;


		// Checbox and name, used for both a single and group of tests.
		html.push(
			'<tr class="' + selected + ' ' + type + '"' + ' ' + dataTest + '>' +
				'<td class="level' + level.length + '" onclick="LiteUnit.toggleTest(event)">' +
					'<label style="user-select: none">' +
						'<input class="enabled" name="' + testName + '" type="checkbox" value="1" ' + checkedAttr + '>' +
						testName +
					'</label>');

		// Expand button
		let expand = LiteUnit.getIntArg(testName + '_expand', level.length <= LiteUnit.expandLevel);
		if (typeof val === 'object') {
			let expandChecked = expand ? 'checked' : '';
			html.push(
				'<a class="expand"  href="javascript:void(0)" onclick="LiteUnit.toggleExpand(event)">▼</a>' +
				'<input class="expand" type="checkbox" style="display: none" name="' + testName + '_expand" value="1"' + expandChecked + '>'
			);
		}


		html.push('</td>');

		// An object of tests
		if (typeof val === 'object') {

			// Run all the sub tests and get their html.
			let subHtml2 = [];
			for (let testName in testObj) {
				let nextLevel = [...level, testName];

				let subHtml = LiteUnit.getTable(val[testName], testName, nextLevel);
				subHtml2 = [...subHtml2, subHtml];
			}

			// Add their html with their pass/fail count.
			html.push(
					'<td class="summary"></td>' +
				'</tr>' +
				'<tr>' +
					'<td colspan=2">' +
						'<div class="indent"><table ' + (expand ? '' : 'style="display: none"') + '>');
			html = [...html, ...subHtml2];

			html.push('</table></div></td>');

		}

		// An individual test
		else
			html.push('</td><td class="result"></td>');


		html.push('</tr>');


		return html.join('');
	},

	/**
	 * Run tests that are selected in the table.
	 * @param table {HTMLTableElement} */
	runTests: function(table) {
		let testTrs = table.querySelectorAll('tr[data-test]');
		for (let tr of testTrs) {
			let code = tr.getAttribute('data-test');


			//console.log(code);

			let runTest = tr.querySelector('input.enabled').checked;

			if (runTest) {
				let tdResult = tr.querySelector('td.result');
				if (LiteUnit.throwError) {
					eval(code + '()');
					tdResult.innerHTML = '<div class="pass">Passed</div>';
				}
				else {

					try {
						eval(code + '()');
						tdResult.innerHTML = '<div class="pass">Passed</div>';
						status++;
					} catch (e) {
						if (LiteUnit.debugOnError)
							debugger;
						tdResult.innerHTML = '<div class="fail">' + LiteUnit.getHtmlStackTrace(e) + '</div>';
					}
				}
			}
		}


		// Update statuses of each group
		let groups = table.querySelectorAll('tr.object');
		for (let group of groups) {
			let nextTr = group.nextSibling;
			if (!nextTr)
				continue;

			let pass = nextTr.querySelectorAll('div.pass').length;
			let fail = nextTr.querySelectorAll('div.fail').length;

			let summary = group.querySelector('td.summary');
			summary.classList.remove('pass');
			summary.classList.remove('fail');
			summary.classList.add(fail===0 ? 'pass' : 'fail');

			if (pass+fail > 0)
				summary.innerHTML = pass + '/' + (pass+fail) + ' passed';
			else
				summary.innerHTML = '';

		}
	},


	/**
	 * @param text {string}
	 * @returns {string} */
	escapeHtml: function(text) { // From stackoverflow.com/a/4835406
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
	},

	getHtmlStackTrace: function(e) {
		if (!e.stack)
			return '';

		var stack = e.stack.split(/\n/); // Remove the liteunit.php lines from the stack trace.
		//stack = stack.slice(0, 1).concat(stack.slice(2));
		var stack2 = [];
		for (var i=0; i<stack.length; i++)
			if (stack[i].indexOf('/liteunit.php?') === -1) // remove frames that are inside liteunit.php
				stack2.push(stack[i]);
		stack = stack2.join('\n');
		return LiteUnit.escapeHtml(stack).replace(/\n/g, '<br/>');
	}
};


// Make global so that event attribute code can call LiteUnit.
window.LiteUnit = LiteUnit;

export { LiteUnit, AssertError, assert, assertEq, assertEqDeep, assertNeq, assertLte };