import {UDim} from "./UDim.js";
import {Color} from "./ColorLerp.js";
import {Lerpable, LerpEngine} from "./LerpEngine.js";

//open file:///home/diamo/Documents/Whisper Engine/Webpages/Home/index.html
window.onload = () => {

    const chars = [];

    (() => {
        let insert = (item) => {
            chars.push(item);
        }

        for (let i = 0; i < 10; i++) {
            insert(String(i));
        }
        for (let c = 0; c < 2; c++) {
            for (let i = 0; i < 26; i++) {
                let byte = String.fromCharCode(i + 97);
                if (c > 0) {
                    byte = byte.toUpperCase();
                }
                insert(byte);
            }
        }
    })()

    function reverseString(str) {
        return str.split("").reverse().join("");
    }

    const lastChar = chars.length - 1;

    function increment(current) {
        let reverse = reverseString(current);

        let newReversed = "";

        let carry = true;
        for (let i = 0; i < reverse.length; i++) {
            let char = reverse.charAt(i);
            if (carry) {
                if (char == chars[lastChar]) {
                    char = chars[0];
                } else {
                    char = chars[chars.indexOf(char) + 1];
                    carry = false;
                }
            }
            newReversed = newReversed + char;
        }
        if (carry) {
            newReversed = newReversed + chars[1];
        }

        return reverseString(newReversed);
    }

    class IID {
        constructor() {
            this.#increment = "0";
        }
        get() {
            let unique = increment(this.#increment);

            this.#increment = unique;

            return unique;
        }
        #increment;
    }

    class ElementRegistry {
        constructor() {
            this.#iid = new IID();
        }
        #iid;
        #getID() {
            return "ELEMENT-" + this.#iid.get();
        };
        serialize(element) {
            let id = element.id;
            if (!id) {
                id = this.#getID();
                element.id = id;
            }
            return id;
        };
        deserialize(id) {
            return document.getElementById(id);
        };
    }

    const registry = new ElementRegistry();

    function tick() {
        return performance.now() / 1000;
    }

    class EasingStyle {
        constructor(type, direction) {
            this.Type = type;
            this.Direction = direction;
        }
    }

    //style, time, property, startValue, endValue, startTick

    class AnimationManager {
        constructor(lerpEngine) {
            this.#registry = new ElementRegistry();
            this.#lerpEngine = lerpEngine
            this.#queue = {};
            this.#connection = renderStepped(() => {
                let now = tick();
                for (let [elementId, elementQueue] of Object.entries(this.#queue)) {
                    let element = this.#registry.deserialize(elementId);
                    let oneFinished = false;
                    for (let [data, queueItem] of Object.entries(elementQueue)) {
                        let split = data.split("_");
                        let namespace = split[0];
                        let property = split[1];
                        let startTick = queueItem.startTick;
                        let time = queueItem.time;
                        let goal = queueItem.goal;
                        let currentValue;
                        if (now >= (startTick + time)) {
                            oneFinished = true;
                            currentValue = goal;
                            delete elementQueue[property];
                        } else {
                            let startValue = queueItem.startValue;
                            let style = queueItem.style;
                            let easingFunction = this.#easing[style.Type][style.Direction];
                            let linearAlpha = (now - startTick) / time;
                            let alpha = easingFunction(linearAlpha);
                            currentValue = startValue.lerp(goal, alpha);
                        }
                        this.#get(element, namespace)[property] = currentValue;
                    }
                    if (oneFinished) {
                        if (Object.keys(elementQueue).length < 1) {
                            delete elementQueue[elementId];
                        }
                    }
                }
            })
        }

        #get(element, namespace) {
            return this.#lerpEngine.Wrap(element)["__" + namespace];
        }

        #easing = {
            Quad: {
                In: (x) => {
                    return x ** 2;
                },
                Out: (x) => {
                    return 1 - (1 - x) ** 2;
                }
            }
        }

        Animate(element, namespace, property, goal, style, time) {
            let now = tick();
            let elementId = this.#registry.serialize(element);
            let elementQueue = this.#queue[elementId]
            if (!elementQueue) {
                elementQueue = {}
                this.#queue[elementId] = elementQueue;
            }
            elementQueue[namespace + "_" + property] = {
                startTick: now,
                startValue: this.#get(element, namespace)[property],
                style: style,
                time: time,
                goal: goal
            }
        }

        #registry;
        #lerpEngine;
        #queue;
        #connection;
        #getID() {

        }
    }

    const lerpEngine = new LerpEngine(window);
    lerpEngine.Register(new Lerpable("udim", UDim));

    const animManager = new AnimationManager(lerpEngine);

    const contentsFrame = document.getElementById("contents");
    const scrollArea = document.getElementById("scrollArea");
    const scrollExtents = document.getElementById("scrollExtents");

    console.warn(window.getComputedStyle(test1).width);

    function connectRaw(event, callback) {
        let active = true;
        let rawCallback;
        rawCallback = (...args) => {
            if (active) {
                callback.apply(null, args);
                event(rawCallback);
            }
        }
        event(rawCallback);
        return () => {
            active = false;
        };
    }

    function connect(element, type, callback) {
        let event = (callback) => {
            element.addEventListener(type, callback);
        }
        return connectRaw(event, callback);
    }

    const offset = 10;

    scrollArea.addEventListener("scroll", () => {
        contentsFrame.style.top = offset - scrollArea.scrollTop;
    })
    contentsFrame.style.top = offset;

    const sidebarControllerEasing = new EasingStyle("Quad", "Out");
    function animateSidebar(percent) {
        animManager.Animate(sidebarController, "udim", "left", new UDim(percent, 0, 0), sidebarControllerEasing, 0.25)
    }

    const infoBarEasing = new EasingStyle("Quad", "Out");
    function setInfoBar(width) {
        animManager.Animate(chatArea, "udim", "width", new UDim(100, -20 - width, 0), infoBarEasing, 0.5);
        animManager.Animate(infoBar, "udim", "right", new UDim(0, width - 20, 0), infoBarEasing, 0.5);
    }

    //info bar views: profile, my profile, message status, conversation participants

    //TODO: info bar views, finish top bar, requests pane, message status in conversation
    //then ui will be done, so ui responsive. finally, make frontend api (module provided by server)
    //then connect frontend api to server

    function openInfoBar() {
        setInfoBar(20)
    }
    function closeInfoBar() {
        setInfoBar(0);
    }

    homeButton.addEventListener("click", () => {
        animateSidebar(0);
    })
    searchButton.addEventListener("click", () => {
        animateSidebar(100);
    })
    requestsButton.addEventListener("click", () => {
        animateSidebar(-100);
    })

    function renderStepped(callback) {
        return connectRaw(requestAnimationFrame, callback);
    }

    renderStepped(() => {
        scrollExtents.style.height = contentsFrame.clientHeight;
    })

    const test = document.getElementById("test1");

    let testUDim = new UDim(window.getComputedStyle(test).getPropertyValue("--udim_width"))

    console.log(testUDim)
    console.log(testUDim.bake())

    test.addEventListener("mouseenter", () => {
        console.log(test.id);
    })

    test.addEventListener("click", () => {
        closeInfoBar();
    })
}
