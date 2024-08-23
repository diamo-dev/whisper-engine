const algorithm = "aes-256-cbc";
const iv = "EYlEAu3X7XSqnchk";

/*/

TODO:

- Chat interaction layer (interacts with database directly)
  - Auth system
  - 

/*/

const fs = require("fs");
const rl = require("readline");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const hasha = require("hasha");
const lineReplace = require("line-replace");
const timers = require("timers");
const { takeHeapSnapshot } = require("process");

function encryptSecret(secret) {
    return bcrypt.hashSync(secret, bcrypt.genSalt());
}

function compareSecret(secret, encrypted) {
    if (bcrypt.compareSync(secret, encrypted)) {
        return hasha(secret);
    } else {
        return false;
    }
}

async function getFileHandle(file, flags) {
    let handle;
    let success = true;
    try {
        handle = await fs.promises.open(file, flags);
    } catch {
        success = false;
    }
    return success, handle
}

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

function bindThis(thisClass, func) {
    return (...args) => {
        return func.apply(thisClass, args);
    }
}

class Connection {
    constructor(event, id) {
        this.#event = event;
        this.#id = id;
    };
    disconnect() {
        if (this.connected) {
            this.#event(this.#id);
            this.connected = false;
        };
    };
    #event;
    #id;
    connected = true;
}

class Event {
    constructor() {
        this.#callbacks = {};
        this.#iid = new IID();
        this.#numCallbacks = 0;
    };
    #callbacks;
    #iid;
    #numCallbacks;
    #withdraw(id) {
        delete this.#callbacks[id];
        this.#numCallbacks -= 1;
    };
    connect(callback) {
        let id = this.#iid.get();
        
        let connection = new Connection(bindThis(this, this.#withdraw), id);

        this.#callbacks[id] = callback;

        this.#numCallbacks += 1;

        return connection;
    };
    invoke(...args) {
        for (let id in this.#callbacks) {
            try {
                this.#callbacks[id].apply(null, args);
            } catch(err) {}
        };
    };
    count() {
        return this.#numCallbacks;
    };
}

function removeNewlines(str) {
    let jsonString = JSON.stringify({t: str});
    return jsonString.slice(6, jsonString.length - 2);
}

function restoreNewlines(str) {
    return str//JSON.parse("{\"t\":\"" + str + "\"}").t
}

function isSecret(secret) {
    return secret && !(secret == "")
}

function decrypt(line, secret) {
    if (line == "") {
        return line;
    }
    if (isSecret(secret)) {
        let key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
        let decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(line, "hex", "utf-8");
        return decrypted.toString() + decipher.final("utf-8").toString();
    } else {
        return line;
    }
}

async function readLines(file, start, end, secret) {
    let interface = rl.createInterface({
        input: fs.createReadStream(file),
        output: null,
        terminal: false
    });
    let lines = [];
    let index = 0;
    let listIndex = 0;
    await new Promise((resolve) => {
        interface.on("line", (line) => {
            index++;
            if (index >= start && index <= end) {
                lines[listIndex] = restoreNewlines(decrypt(line, secret));
                listIndex++;
            } else if (index > end) {
                interface.close();
                resolve();
            }
        })
        interface.on("close", () => {
            resolve();
        })
    });
    return lines;
}

async function getLineCount(file) {
    let interface = rl.createInterface({
        input: fs.createReadStream(file),
        output: null,
        terminal: false
    });
    let count = 0;
    await new Promise((resolve) => {
        interface.on("line", (line) => {
            count++;
        })
        interface.on("close", () => {
            resolve();
        })
    });
    return count;
}

function getFileSize(file) {
    return fs.statSync(file).size;
}

function isEmpty(file) {
    return (getFileSize(file) < 1);
}

function encrypt(line, secret) {
    if (line == "") {
        return line;
    }
    if (isSecret(secret)) {
        let key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
        let cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(line, "utf-8", "hex");
        return encrypted.toString() + cipher.final("hex").toString();
    } else {
        return line;
    }
}

async function writeLineRaw(file, index, line) {
    let lineCount = await getLineCount(file);
    await new Promise((resolve) => {
        lineReplace({
            file: file,
            line: index,
            text: line,
            addNewLine: (index < lineCount),
            callback: resolve
        })
    })

}

async function deleteLine(file, index) {
    await new Promise((resolve) => {
        lineReplace({
            file: file,
            line: index,
            text: "",
            addNewLine: false,
            callback: resolve
        })
    })
}

async function writeLine(file, index, line, secret) {
    await writeLineRaw(file, index, encrypt(removeNewlines(line), secret));
}

async function appendToBeginningRaw(file, line) {
    if (!isEmpty(file)) {
        let contents = await readLines(file, 1, 1);
        await writeLineRaw(file, 1, line + "\n" + contents[0]);
    } else {
        await fs.writeFileSync(file, line);
    }
}

async function appendToBeginning(file, line, secret) {
    await appendToBeginningRaw(file, encrypt(removeNewlines(line), secret));
}

async function appendLineRaw(file, line) {
    if (isEmpty(file)) {
        fs.writeFileSync(file, line);
    } else {
        let lineCount = await getLineCount(file);
        let lastLine = await readLines(file, lineCount, lineCount);
        await writeLineRaw(file, lineCount, lastLine[0] + "\n" + line);
    }
}

async function appendLine(file, line, secret) {
    await appendLineRaw(file, encrypt(removeNewlines(line), secret));
}

class DynamicIndex {
    constructor(onDisconnect, event, index) {
        this.#onDisconnect = onDisconnect;
        this.#index = index;
        this.#connection = event.connect(bindThis(this, this.#callback));
    }
    #callback(operation, index) {
        switch (operation) {
            case "append":
                this.#index++;
                break;
            case "delete":
                if (index < this.#index) {
                    this.#index -= 1;
                }
                break;
        }
    };
    #disconnect() {
        let conn = this.#connection;
        if (conn.connected) {
            conn.disconnect();
            this.#onDisconnect();
            this.#index = undefined;
        }
    }
    #onDisconnect;
    #connection;
    #index;
    get() {
        return this.#index;
    }
    destroy() {
        this.#disconnect();
    }
};

class Stream {
    constructor(dynamicIndex, readLines, lineCount) {
        this.#dynamicIndex = dynamicIndex;
        this.#readLines = readLines;
        this.#lineCount = lineCount;
    }

    async init() {
        await this.#privNext(this.#dynamicIndex);
        return this;
    }

    #dynamicIndex;
    #readLines;
    #lineCount;
    #index;
    #nextIndex;
    #endIndex;
    #current;
    #nextChunk;
    #isFinished;
    #ready = false;

    #isLast() {
        return (this.#current.length < this.#lineCount || (this.#nextChunk || [1]).length < 1);
    }
    #increment(index) {
        return this.#dynamicIndex(index.get() + this.#lineCount);
    }
    #privDestroy() {
        try {
            this.#index.destroy();
            this.#nextIndex.destroy();
            this.#endIndex.destroy();
        } catch {}
    }

    async #privNext(dynamicIndex) {
        if (!(this.#index) || this.#ready) {
            this.#ready = false
            if (!this.#isFinished) {
                if (!this.#index) {
                    this.#index = dynamicIndex(1);
                    this.#nextIndex = dynamicIndex(1)
                    this.#endIndex = this.#increment(this.#nextIndex);
                    this.#nextChunk = await this.#readLines(this.#nextIndex.get(), this.#endIndex.get() - 1);
                }
                let oldIndex = this.#index;
                let newIndex = this.#nextIndex;
                let newNextIndex = this.#endIndex;
                this.#index = newIndex;
                this.#nextIndex = newNextIndex;
                oldIndex.destroy();
                this.#endIndex = this.#increment(this.#nextIndex);
                this.#current = this.#nextChunk;
                if (!this.#isLast()) {
                    this.#nextChunk = await this.#readLines(this.#nextIndex.get(), this.#endIndex.get() - 1);
                };
                this.#isFinished = this.#isLast();
                if (this.#isFinished) {
                    this.#privDestroy();
                };
            }
            this.#ready = true;
        }
        return;
    }

    async next() {
        return await this.#privNext(this.#dynamicIndex);
    }

    read() {
        return this.#current;
    }
    finished() {
        return this.#isFinished;
    }
    destroy() {
        this.#privDestroy();
    }
}

class HandleManager {
    constructor() {
        this.#handles = {};
    }
    #handles;

    #get(path) {
        let handle = this.#handles[path];
        if (!handle) {
            handle = new Event();
            this.#handles[path] = handle;
        }
        return handle;
    }

    dynamicIndex(path, index) {
        let handle = this.#get(path);
        return new DynamicIndex(() => {
            if (handle.count() < 1) {
                delete this.#handles[path];
            }
        }, handle, index);
    }

    update(path, ...args) {
        let handle = this.#handles[path];
        if (handle) {
            handle.invoke.apply(handle, args);
        }
    }
}

const handleManager = new HandleManager();

class PaginatedFile {
    constructor(file, secret) {
        this.#file = file;
        this.#secret = secret;
    };
    #file;
    #secret;
    #update(...args) {
        args.unshift(this.#file);
        handleManager.update.apply(handleManager, args);
    }
    #dynamicIndex(index) {
        return handleManager.dynamicIndex(this.#file, index);
    };
    async readLines(start, end) {
        return await readLines(this.#file, start, end, this.#secret);
    };
    async appendToBeginning(line) {
        await appendToBeginning(this.#file, line, this.#secret);
        this.#update("append");
        return;
    };
    async appendLine(line) {
        await appendLine(this.#file, line, this.#secret);
    };
    async writeLine(index, line) {
        await writeLine(this.#file, index, line, this.#secret);
    };
    async deleteLine(index) {
        if (index > 0) {
            await deleteLine(this.#file, index);
            await this.#update("delete", index);
        }
        return;
    };

    async index(index) {
        return this.#dynamicIndex(index);
    }

    async stream(lineCount) {
        let stream = new Stream(bindThis(this, this.#dynamicIndex), bindThis(this, this.readLines), lineCount);
        await stream.init();
        return stream;
    };
}

class File {
    constructor(file, secret) {
        this.#file = file;
        this.#secret = secret;
    };
    #file;
    #secret;
    read() {
        return decrypt(fs.readFileSync(this.#file), this.#secret);
    }
    write(data) {
        fs.writeFileSync(this.#file, encrypt(data, this.#secret));
    }
}

class Keychain {
    constructor(file, folder) {
        this.#file = file;
        this.#folder = folder;
    };
    #file;
    #folder;

    async #find(entry, callback) {
        let doReturn = false;

        let stream = this.#file.stream(10);

        let index = await this.#file.index(1);
        let check = async (lines) => {
            for (let i = 0; i < 10; i++) {
                let line = lines[i];
                let keyEntry = line.split(" ");
                if (entry == keyEntry[0]) {
                    doReturn = true;
                    await callback(keyEntry[1], index);
                } else {
                    let newIndex = await this.#file.index(index.get() + 1);
                    await index.destroy();
                    index = newIndex;
                }
            }
            await stream.next();
        }

        while ((!stream.finished()) && (!doReturn)) {
            check();
        }

        if (!doReturn) {
            check();
            if (!doReturn) {
                await callback();
            }
        }

        index.destroy()

        return;
    }

    async getSecret(entry) {
        let key;
        
        await this.#find(entry, async (secret) => {
            if (secret) {
                let path = this.#folder + "/" + entry + "/_SECRET"
                if (fs.existsSync(path)) {
                    key = compareSecret(keyEntry[1], fs.readFileSync(path))
                }
            }
        })

        return key;
    }
    async addSecret(entry, secret) {
        let str = entry + " " + secret;
        await this.#file.appendLine(str);
        return hasha(secret);
    }
    async removeSecret(entry) {
        await this.#find(entry, async (_, index) => {
            if (index) {
                this.#file.deleteLine(index.get())
            }
        })
    }
}

class Entry {
    constructor(namespace, key, id, secret) {
        this.#namespace = namespace;
        this.#key = key;
        this.#privateAccess = true;
        let path = "./" + namespace + "/" + key + "/" + id + "/";
        let secretPath = path + "_SECRET";
        if (fs.existsSync(path)) {
            if (fs.existsSync(secretPath)) {
                let encrypted = fs.readFileSync(secretPath);
                this.#privateAccess = compareSecret(secret, encrypted);
            }
        } else {
            fs.mkdirSync(path);
            if (secret) {
                this.#secret = hasha.hash(secret);
                fs.writeFileSync(secretPath, encryptSecret(secret));
                fs.mkdirSync(path + "Public/");
            }
            switch(key) {
                case "Users":
                    fs.writeFileSync(path + "Keychain", "");
                    break;
                case "Conversations":
                    fs.writeFileSync(path + "Data", "");
                    fs.writeFileSync(path + "Permissions", "");
                    break;
            }
        }
    }

    #path;
    #secret;
    #namespace;
    #key;
    #privateAccess;
    #checkAccess() {
        if (!this.#privateAccess) {
            throw new Error("Access denied: private access expected, got public access");
        }
    }
    #checkPublicity() {
        if ((!this.#secret) && this.#privateAccess) {
            throw new Error("Entry is already public!");
        }
    }
    getKeychain() {
        this.#checkAccess();
        if (this.#key == "Users") {
            let file = new PaginatedFile(this.#path + "Keychain", this.#secret);
            return new Keychain(file, "./" + this.#namespace + "/Conversations");
        } else {
            throw new Error("Entry class of \"User\" expected, got \"" + this.#key + "\"");
        }
    };
    
    getPagenatedFile(file) {
        this.#checkAccess();
        return new PaginatedFile(this.#path + file, this.#secret);
    }
    getFile(file) {
        this.#checkAccess();
        return new File(this.#path + file, this.#secret);
    }

    getPublicPagenatedFile(file) {
        this.#checkPublicity();
        return new PaginatedFile(this.#path + "Public/" + file);
    }
    getPublicFile(file) {
        this.#checkPublicity();
        return new File(this.#path + "Public/" + file);
    }
}

const PermissionLevels = {
    "0": "Blacklisted", //cant view
    "1": "Viewer", //can view
    "2": "Participant", //can chat
    "3": "Inviter", //can invite
    "4": "Moderator", //can kick, ban, mute
    "5": "Owner" //can promote and demote mods, delete conversation, set community type
}

//3 types of conversations:

//Private Group: everyone is a Participant

//Public Group: everyone is an Inviter

//Community: creator is Owner
// types:
//  private: Inviter is inaccessible, replaced with Participant
//  public: Participant is inaccessible, replaced with Inviter

class Partition {
    constructor(namespace, key) {
        this.#namespace = namespace;
        this.#key = key;
        let path = "./" + namespace + "/" + key;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    #namespace;
    #key;
}

const hashLength = 64;

function hashR() {
    let str = "";
    for (let i = 0; i < hashLength; i++) {
        str = str + chars[crypto.randomInt(0, lastChar)]
    };
    return str;
}

function reverseString(str) {
    return str.split("").reverse().join("");
}

class Registry {
    constructor(namespace) {
        this.#namespace = namespace;
        let path = "./" + namespace;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
            fs.writeFileSync(path + "/_INCREMENT", "0");
        }
    }

    get(key) {
        return new Partition(this.#namespace, key);
    }

    #hashI() {
        let path = "./" + this.#namespace + "/_INCREMENT";
        let current = fs.readFileSync(path).toString();
        
        let unique = increment(current);

        fs.writeFileSync(path, unique);

        return unique;
    }

    hash() {
        return this.#namespace.toUpperCase() + "-" + this.#hashI() + "-" + hashR();
    }

    #namespace;
}

const registry = new Registry("Whisper");

const users = registry.get("Users");
const convs = registry.get("Conversations");

class User {
    constructor(id, auth) {
        this.id = id;
    }

    id;
}

console.log(registry.hash())
console.log("server.js is active.")

let test = {
    gaming: `we
    are
    so
    gaming`
}

module.exports.Registry = Registry;

console.log(JSON.stringify(test));
console.log(test.gaming);

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
    let manager = new PaginatedFile("./Stream Tests/Encrypted.txt", "we are so gaming");
    await manager.appendLine("what the hell")
    //return;
    await manager.appendLine("if i dont see this istg")
    await manager.appendLine("but if you do omg it worked first try what")
    await manager.appendLine("there could be a private convo here")
    let stream = await manager.stream(10);
    let index = 0;
    async function display() {
        index++;
        console.log("---- Chunk #" + index + " ----");
        console.log(stream.read().join("\n"));
        await manager.deleteLine(index);
        await stream.next();
    }
    while (!(stream.finished())) {
        await display();
    }
    await display();
    console.log("---- End of file. ----");
})()