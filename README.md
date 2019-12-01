# XElement

**WARNING: This project is in alpha and is not yet ready for use.**

![header](img/header.jpg)

XElement  is a lightweight JavaScript library making it easy to create HTML user interface components:

```html
<template id="Inventory">4
    <button onclick="addItem()">Add Item</button>
    <div data-loop="items:item">
        <div>
            <input data-val="item.name">
            <input data-val="item.qty">
        </div>
    </div>
</template>

<script>
class Inventory extends XElement {
    addItem() {
        this.items.push({name: '', qty: 0});
    }
}
Inventory.html = '#Inventory';
</script>

<x-inventory></x-inventory>
```

Features:

- Model-View-Vie Model (MVVM) pattern for convenient data binding.
- Only **8KB** minified!  Or smaller when gzipped.
- Zero dependencies.  Just include xelement.js or xelement.min.js.
- Doesn't take over your whole project.  Use it only where you need it.
- Uses standard html.  No need to learn a templating language.
- Uses ShadowDOM by default, so each XElement can have its own styles.
- MIT license.  Free for commercial use.

## Minimal Example

In this minimal example, we make a new class called Hello and set its html.  Any class that extends XElement automatically creates a new html tag with a name of "x-" plus the lower case version of the class name.

```html
<script src="xelement.js"></script>
<script>
	class Hello extends XElement {}
    Hello.html = `<div>Hello XElement!</div>`;
</script>

<!-- Prints an element with textContent = "Hello XElement!" -->
<x-hello></x-hello>
```

Subsequent examples omit the  ```<script src="xelement.js"></script>``` tag for brevity.
## Basic Use

An XElement can also be instantiated with the new keyword:

```javascript
var hello = new Hello();
document.body.appendChild(hello);
```

If the html property is set to a valid CSS selector, XElement will pull its html from that element.  This can be useful if using an IDE that don't support syntax highlighting html inside of strings.

```html
<template id="hello">Hello XElement!</template>

<script>
	class Hello extends XElement {}
    HelloWorld.html = '#hello';
}
</script>
```

XElements can also be embedded within the html of other XElements:

```javascript
class Wheel extends XElement {}
Wheel.html = '<div>O</div>';

class Car extends XElement {}
Car.html = `
	<div>
		<x-wheel></x-wheel>
        <x-wheel></x-wheel>
        <x-wheel></x-wheel>
        <x-wheel></x-wheel>
	</div>`;
```

XElements create their html children as [ShadowDOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM).  This allows styles to be embedded that only apply to the html of the XElement.  The *:host* selector is used to style the element itself, per the ShadowDOM specification.

```javascript
class Fancy extends XElement {}
Fancy.html = `
	<div>		
		<p>Fancy text!</p>
		<style>
			:host { border: 10px dashed red }
			p { text-shadow: 0 0 5px orange }
		</style>
	</div>`;
```

## Ids

Any element in the html with an id is automatically bound to a property with the same name on the class instance:

```javascript
class Car extends XElement {}
Car.html = `
	<div>
		<input id="driver" value="Vermin Supreme">
	</div>`;

var car = new Car();
console.log(car.driver.value);     // Vermin Supreme
car.driver.value = 'Chuck Norris'; // Puts text in input box.
car.driver = 3; // Error, property is read-only.
```

## Attributes

TODO

## Slots

TODO

## Data Binding

XElement performs data-binding with any element that has an attribute name with the *data-* prefix.

### Attributes

Attributes are bound to class properties with the data-*name* attribute, where *name* can be any valid html attribute.  The value of these attributes can be any valid html code:

```javascript
class Car extends XElement {}
Car.html = `
	<div data-title="this.hoverText + 'Do it now!'">
		<input data-required="mustHaveDriver" value="Vermin Supreme">
	</div>`;
var car = new Car();
car.mustHaveDriver = true;  // Sets required attribute on input.
car.mustHaveDriver = false; // Removes required attribute.
car.hoverText = 'Get in! '; // Sets title to "Get in! Do it now!"
```

Note that the *this.* prefix is optional when using a simple variable name.  Bound variables are created on the class instance if they don't already exist.

#### What is a simple variable?

A simple variable is any property that can be directly accessed without evaluating any code.  These are simple variables:

- mustHaveDriver
- this.that.somethingElse
- cats[3].color['red']

These are not simple variables:

- !mustHaveDriver
- cats.length
- cats[3].purr()
- cats[myCat]
- window.location

### Text and Html

TODO

### Val

data-val is a special two-way data binding for form elements.  It's two way because not only is the html updated when the class property changes, but the class property is also changed when a user interacts with a data-val bound form element:

### Visible

The data-visible attribute sets an element to be display: none if it evaluates to a false-like value.

### Classes

TODO

### Loop

TODO

## Events

TODO



## Missing / Future Features

- XElement can only bind to JavaScript variables names that use standard ascii.
- Performance improvements
- More data- binding attributes.
- Support for non-beta versions of Microsoft Edge.



---

Picture used in header is *Dreaming in Mech*, by Jakub Rozalski.  Minified sizes are depicted.

