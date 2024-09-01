const udimProperties = [
    {
        key: "Percent",
        suffix: "%"
    },
    {
        key: "EmOffset",
        suffix: "em"
    },
    {
        key: "PxOffset",
        suffix: "px"
    }
]

function rawLerp(initial, goal, alpha) {
    return initial + ((goal - initial) * alpha);
}
function orZero(num) {
    if (!num) {
        num = 0;
    }
    return num;
}

function lerpProp(key, self, other, alpha) {
    return rawLerp(orZero(self[key]), orZero(other[key]), alpha);
}

export class UDim {
    constructor(percentOrSerialization, emOffset, pxOffset) {
        if (typeof percentOrSerialization == "string") {
            let str = percentOrSerialization;
            this.Percent = 0;
            this.EmOffset = 0;
            this.PxOffset = 0;
            if (percentOrSerialization != "0") {
                let valuesDone = {};
                let values = str.split(" ");
                for (let substr of values) {
                    let unit;
                    let offset;
                    for (let unitData of udimProperties) {
                        let suffix = unitData.suffix;
                        if (substr.endsWith(suffix)) {
                            let key = unitData.key;
                            if (!valuesDone[key]) {
                                unit = key;
                                offset = suffix.length;
                                valuesDone[key] = true;
                                break;
                            } else {
                                throw new Error("2 or more of type " + key + " found in UDim");
                            };
                        }
                    }
                    this[unit] = Number(substr.substring(0, substr.length - offset));
                }
            }
        } else {
            this.Percent = percentOrSerialization;
            this.EmOffset = emOffset;
            this.PxOffset = pxOffset;
        }
    };
    #getSetValues() {
        let setValues = [];
        for (let unitData of udimProperties) {
            let key = unitData.key;
            let value = this[key];
            if (value && (value != 0)) {
                setValues[setValues.length] = String(value) + unitData.suffix;
            }
        }
        return setValues;
    };
    lerp(other, alpha) {
        return new UDim(lerpProp("Percent", this, other, alpha), lerpProp("EmOffset", this, other, alpha), lerpProp("PxOffset", this, other, alpha));
    }
    serialize() {
        let setValues = this.#getSetValues();
        if (setValues.length > 0) {
            return setValues.join(" ");
        } else {
            return "0";
        }
    };
    bake() {
        let setValues = this.#getSetValues();
        if (setValues.length > 0) {
            if (setValues.length > 1) {
                let str = "calc(";
                let first = true;
                for (let value of setValues) {
                    if (first) {
                        str += value;
                        first = false;
                    } else {
                        let sign = "+";
                        if (value.startsWith("-")) {
                            sign = "-";
                            value = value.substring(1, value.length);
                        }
                        str += " " + sign + " " + value;
                    }
                }
                return str + ")"
            } else {
                return setValues[0];
            }
        } else {
            return "0";
        }
    }
}