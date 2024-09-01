export class Lerpable {
    constructor(namespace, lerpClass) {
        this.Namespace = namespace;
        this.Class = lerpClass;
    }
    static Namespace;
    static Class;
}

//[namespace]_[property hook]

export class LerpEngine {
    constructor(window) {
        this.#lerpables = {};
        this.#window = window;
    };
    #lerpables;
    #window;
    Register(Lerpable) {
        this.#lerpables[Lerpable.Namespace] = Lerpable.Class;
    };
    Wrap(element) {
        let lerpables = this.#lerpables;
        let window = this.#window;
        return new Proxy({}, {
            get(_, key) {
                if (key.startsWith("__")) {
                    let namespace = key.substring(2, key.length);
                    let lerpClass = lerpables[namespace];
                    if (lerpClass) {
                        return new Proxy({}, {
                            get(_, key) {
                                return new lerpClass(window.getComputedStyle(element).getPropertyValue("--" + namespace + "_" + key));
                            },
                            set(_, key, value) {
                                if (!(value instanceof lerpClass)) {
                                    throw new Error(namespace + " expected, got \"" + typeof(value) + "\"");
                                } else {
                                    element.style.setProperty("--" + namespace + "_" + key, value.serialize());
                                    element.style.setProperty(key, value.bake());
                                    return true;
                                }
                            }
                        })
                    } else {
                        throw new Error("\"" + namespace + "\" is not a valid Lerpable")
                    }
                } else {
                    const value = element[key];
                    if (value) {
                        if (value instanceof Function) {
                            return function(...args) {
                                return value.apply(element, args);
                            }
                        } else {
                            return value;
                        }
                    } else {
                        return window.getComputedStyle(element).getPropertyValue(key);
                    }
                }
            },
            set(_, key, value) {
                element.style[key] = value;
            }
        })
    };
}