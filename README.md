# XElement

**WARNING: This project is in alpha and is not yet ready for use.**

![header](img/header.jpg)

XElement  is a lightweight JavaScript library making it easy to create HTML user interface components:

```javascript
class Inventory extends XElement {
    addItem() {
        this.items.push({name: '', qty: 0});
    }   
}
Inventory.html = `
    <div>
        <button onclick="addItem()">Add Item</button>
        <div x-loop="items:item">
            <div>
                <input x-val="item.name">
                <input x-val="item.qty">
            </div>
        </div>
    </div>`;

var inv = new Inventory();

// We could alternatively create the element directly within html by adding <x-inventory></xinventory> directly.
document.body.append(inv);
```

Features:

- Model-View-Vie Model (MVVM) pattern for convenient data binding.
- Only **15KB** minified!  Or smaller when gzipped.
- Zero dependencies.  Just include xelement.js or xelement.min.js.
- Doesn't take over your whole project.  Use it only where you need it.
- Uses standard html.  No need to learn a templating language.
- Uses [ShadowDOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM) by default, so each XElement can have its own styles.
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

## Initializers

Setting attributes on the XElement's root html element will:

- If the attribute names are valid html attributes, set those attributes on the XElement instance.
- If they are not, set properties with those names on the XElement.

Any attribute values wrapped in braces {} will have their values evaluated as JavaScript code.  This is an easy way to pass data to an XElement when creating it.

## Slots

TODO

Anonymous slots:

```html
<script>
    class Car extends XElement {}
    Car.html = `
        <div>
            <div>Engine</div>
            <slot></slot>
        </div>`;
</script>

<x-car>
    <div>wheel</div>
    <div>wheel</div>
    <div>wheel</div>
    <div>wheel</div>
</x-car>
```

Named slots:

```html
<script>
    class Car extends XElement {}
    Car.html = `
        <div>
            <slot name="engine"></slot>
            <slot name="wheels"></slot>
        </div>`;
</script>

<x-car>
    <div slot="engine">3.1L V6</div>
    <div slot="wheels">        
        <div>wheel</div>
        <div>wheel</div>
        <div>wheel</div>
        <div>wheel</div>
    </div>
</x-car>
```



## Data Binding

XElement performs data-binding with any element that has an attribute name with the `x-` prefix.  If your IDE doesn't like custom attribute names, you can instead use the `data-` prefix for all attributes.

### Attributes

Attributes are bound to class properties with the `x-name` attribute, where *name* can be any valid html attribute.  The value of these attributes can be any valid html code:

```javascript
class Car extends XElement {}
Car.html = `
    <div x-title="this.hoverText + 'Do it now!'">
        <input x-required="mustHaveDriver">
    </div>`;
var car = new Car();
car.mustHaveDriver = true;  // Sets required attribute on input.
car.mustHaveDriver = false; // Removes required attribute.
car.hoverText = 'Get in! '; // Sets title to "Get in! Do it now!"
```

### Text and Html

TODO

### Val

`x-val` is used to bind input, select, textarea, and contenteditable form elements to a class field.  

If the bound variable is standalone (see below), then a special two-way data binding for form elements.  It's two way because not only is the html updated when the class property changes, but the class property is also changed when a user interacts with the bound form element.

### Visible

The `x-visible` attribute sets an element to be display: none if it evaluates to a false-like value.

### Classes

The `x-classes` attribute allows toggling classes on or off  when an expression evaluates to true or false.  The code below renders the span as `<span class="big isScary">It's a monster!</span>`

```javascript
class Monster extends XElement {}
Monster.html = `
    <div>
        <span x-classes="big: this.height>10, scary: isScary">It's a monster!</span>
    </div>`;
var m = new Monster();
m.height = 11;
m.isScary = true;
```

### Loop

```javascript
class Car extends XElement {}
Car.html = `
    <div data-loop="wheels: wheel">
        <span x-text="wheel.name"></span>
    </div>`;
var car = new Car();
car.wheels = [
    {name: 'front-left'}, 
    {name: 'front-right'},
    {name: 'rear-left'},
    {name: 'rear-right'}
];
```



## Special Cases

### Automatic "this"

In x- binding attributes, variables are automatically created on the class instance if they don't already exist.  Note that the `this.` prefix is optional when the expression is a standalone variable and nothing more.  Complex expressions require the `this.` prefix when referencing class properties

#### What counts as a standalone variable?

A variable is any expression that evaluates.  These are simple variables:

- mustHaveDriver
- this.that.somethingElse
- cats[3].color['red']

These expressions are not standalone variables:

- !mustHaveDriver
- cats.length
- cats[3].purr()
- cats[myCat]
- window.location

### Duplicate References

Be careful when binding to an object that contains the same instance of another object twice:

```javascript
class CatHouse extends XElement {}
CatHouse.html = `
    <div>
        <span id="span" x-text="this.cat1.name"></span>
    </div>`;

var c = new CatHouse();
document.body.appendChild(c);

var myCat = {name: 'Fluffy'};
c.cat1 = myCat;
c.cat2 = myCat;

c.cat2.name = 'Fluffy Jr.'; // Fails to update span b/c the binding is on cats.cat1!
c.cat1.name = 'Fluffy Jr.'; // works
```

Updating the myCat instance at the cat2 path fails because only the cat1 reference is watched.  Nothing subscribes to the cat2 instance so changes made to it are not tracked.

## Events

TODO

## Watch

### Proxies

TODO: $isProxy, $removeProxy



## Styling

TODO

## Missing / Future Features

- XElement can only bind to JavaScript variables names that use standard ascii.
- Performance improvements
- More x- binding attributes.
- Support for non-beta versions of Microsoft Edge.



---

Picture used in header is *Dreaming in Mech*, by Jakub Rozalski.  Minified sizes are depicted.

