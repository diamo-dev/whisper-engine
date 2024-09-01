const colorProperties = [
    "Red",
    "Green",
    "Blue"
]

function rawLerp(initial, goal, alpha) {
    return initial + ((goal - initial) * alpha);
}
function lerpProp(key, self, other, alpha) {
    return rawLerp(self[key], other[key], alpha);
}

export class Color {
    constructor(redOrSerialization, green, blue) {
        if (typeof redOrSerialization == "string") {
            let rgb = redOrSerialization.split(" ");
            let index = 0;
            for (let key of colorProperties) {
                this[key] = Number(rgb[index]);
                index++;
            }
        } else {
            this.Red = redOrSerialization;
            this.Green = green;
            this.Blue = blue;
        }
    };
    lerp(other, alpha) {
        return new Color(lerpProp("Red", this, other, alpha), lerpProp("Green", this, other, alpha), lerpProp("Blue", this, other, alpha));
    };
    serialize() {
        return String(this.Red) + " " + String(this.Green) + " " + String(this.Blue);
    };
    bake() {
        return "rgb(" + String(this.Red) + ", " + String(this.Green) + ", " + String(this.Blue) + ")";
    };
}