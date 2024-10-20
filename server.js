const algorithm = "aes-256-cbc";
const iv = "EYlEAu3X7XSqnchk";
const pathCrypt = "d3gRv4JKQ0dFg5WdF2";

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
    return bcrypt.hashSync(secret, bcrypt.genSaltSync(1024));
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
            } catch (err) { }
        };
    };
    count() {
        return this.#numCallbacks;
    };
}

function removeNewlines(str) {
    let jsonString = JSON.stringify({ t: str });
    return jsonString.slice(6, jsonString.length - 2);
}

function restoreNewlines(str) {
    return JSON.parse("{\"t\":\"" + str + "\"}").t
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

function toPathKey(path) {
    return encrypt(path, pathCrypt);
}
function fromPathKey(pathKey) {
    return decrypt(pathKey, pathCrypt);
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
        await writeLineRaw(file, 1, line + "\n" + removeNewlines(contents[0]));
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
        await writeLineRaw(file, lineCount, removeNewlines(lastLine[0]) + "\n" + line);
    }
}

async function appendLine(file, line, secret) {
    await appendLineRaw(file, encrypt(removeNewlines(line), secret));
}

async function insertLineRaw(file, index, line) {
    if (isEmpty(file)) {
        fs.writeFileSync(file, line);
    } else {
        let lineCount = await getLineCount(file);
        if ((lineCount + 1) >= index) {
            let currentLine = await readLines(file, index, index);
            await writeLineRaw(file, index, line + "\n" + removeNewlines(currentLine[0]));
        } else {
            await appendLineRaw(file, line);
        }
    }
}

async function insertLine(file, index, line, secret) {
    await insertLineRaw(file, index, encrypt(removeNewlines(line), secret));
}

function isFolderEmpty(path) {
    let dir = fs.opendirSync(path);
    let file = dir.readSync();
    dir.closeSync();
    if (file) {
        return false;
    } else {
        return true;
    }
}

function indexHandler(thisIndex, operation, index) {
    switch (operation) {
        case "append":
            if (index <= thisIndex) {
                thisIndex += 1;
            }
            break;
        case "delete":
            if (index < thisIndex) {
                thisIndex -= 1;
            }
            break;
    }
    return thisIndex;
}

class DynamicIndex {
    constructor(onDisconnect, event, index) {
        this.#onDisconnect = onDisconnect;
        this.#index = index;
        this.#connection = event.connect(bindThis(this, this.#callback));
    }
    #callback(operation, index) {
        this.#index = indexHandler(this.#index, operation, index)
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
    add(offset) {
        this.#index += offset;
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
        } catch { }
    }

    async #privNext(dynamicIndex) {
        if (!(this.#index) || this.#ready) {
            this.#ready = false
            if (!this.#isFinished) {
                if (!this.#index) {
                    this.#index = dynamicIndex(1);
                    this.#nextIndex = this.#increment(this.#index);
                    this.#nextChunk = await this.#readLines(this.#index.get(), this.#nextIndex.get() - 1);
                }
                this.#index.destroy();
                this.#index = this.#nextIndex;
                this.#nextIndex = this.#increment(this.#index);
                this.#current = this.#nextChunk;
                if (!this.#isLast()) {
                    this.#nextChunk = await this.#readLines(this.#index.get(), this.#nextIndex.get() - 1);
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

let streamExpiry = 3600;

function serializeStreamContents(lineCount, lines) {
    let split = [];
    for (let i = 0; i < lineCount; i++) {
        let line = lines[i];
        if (line) {
            line = removeNewlines(line);
        } else {
            line = ""
        }
        split[i] = line;
    }
    return split.join("\n")
}

class PaginatedFile {
    constructor(file, secret, registry) {
        this.#file = file;
        this.#secret = secret;

        if (registry) {
            this.#registry = registry;
            this.#fileKey = toPathKey(file.slice(registry.namespace.length + 3));
        }
    };
    #file;
    #secret;
    #registry;
    #fileKey;
    async #update(...args) {
        args.unshift(this.#file);
        handleManager.update.apply(handleManager, args);
        if (this.#fileKey) {
            args.shift();
            let folder = "./" + this.#registry.namespace + "/_STREAMS/" + this.#fileKey;
            if (fs.existsSync(folder)) {
                let dir = fs.opendirSync(folder);
                let fileName = dir.readSync();
                while (fileName) {
                    let file = new PaginatedFile(folder + "/" + fileName.name, this.#secret);

                    let index = await file.readLine(2);

                    if (index != "undefined") {
                        try {
                            let localArgs = []
                            localArgs.push.apply(localArgs, args);
                            localArgs.unshift(Number(index));
                            await file.writeLine(2, String(indexHandler.apply(null, localArgs)))
                        } catch { }
                    }

                    fileName = dir.readSync();
                }

                dir.closeSync();
            }
        }
    }
    #dynamicIndex(index) {
        return handleManager.dynamicIndex(this.#file, index);
    };
    async readLines(start, end) {
        return await readLines(this.#file, start, end, this.#secret);
    };
    async readLine(index) {
        let lines = await readLines(this.#file, index, index, this.#secret)
        return lines[0];
    };
    async appendToBeginning(line) {
        await appendToBeginning(this.#file, line, this.#secret);
        await this.#update("append", 1);
        return;
    };
    async appendLine(line) {
        await appendLine(this.#file, line, this.#secret);
    };
    async insertLine(index, line) {
        await insertLine(this.#file, index, line, this.#secret);
        await this.#update("append", index);
        return;
    }
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

    isEmpty() {
        return isEmpty(this.#file);
    };

    async index(index) {
        return this.#dynamicIndex(index);
    };

    async stream(lineCount) {
        let stream = new Stream(bindThis(this, this.#dynamicIndex), bindThis(this, this.readLines), lineCount);
        await stream.init();
        return stream;
    };

    async persistentStream(owner, lineCount) { //owner must be Entry, not just userid, with private access
        if (!this.#fileKey) {
            throw new Error("Persistent streams require Registry access")
        }
        if (owner.isPrivate()) {
            let registry = this.#registry;
            let streamId = registry.iid();

            let userId = owner.id();

            let index = await this.#dynamicIndex(1);
            let nextIndex = await this.#dynamicIndex(index.get() + lineCount);

            let first = await this.readLines(index.get(), nextIndex.get() - 1);
            let second;

            let fileEnd = false;
            let streamEnd = false;

            if (first.length < lineCount) {
                streamEnd = true;
            } else {
                await index.destroy();
                index = nextIndex;
                nextIndex = await this.#dynamicIndex(index.get() + lineCount);

                second = await this.readLines(index.get(), nextIndex.get() - 1);

                let length = second.length

                if (length < lineCount) {
                    if (length < 1) {
                        streamEnd = true;
                    } else {
                        fileEnd = true;
                    }
                }
            }

            await index.destroy();

            index = nextIndex.get();
            await nextIndex.destroy();

            let statusNumber = "0";

            if (streamEnd) {
                statusNumber = "2";
            } else if (fileEnd) {
                statusNumber = "1";
            }

            if (statusNumber == "0") {
                index = String(index);
            } else {
                index = "undefined";
            }

            let data = userId + "\n" + index + "\n" + String(lineCount) + "\n" + statusNumber + "\n" + serializeStreamContents(lineCount, first);

            if (statusNumber != "2") {
                data += "\n" + serializeStreamContents(lineCount, second);
            }

            let key = this.#fileKey

            let folderPath = "./" + registry.namespace + "/_STREAMS/" + key

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath);
            }

            let file = new File(folderPath + "/" + streamId, this.#secret);
            await file.write(data);

            await registry.schedule.schedule(streamExpiry, "stream_expiry", key, streamId);

            return streamId, key;
        } else {
            throw new Error("Expected private access to owner")
        }
    }

    async #getData(user, streamId) {
        if (!this.#fileKey) {
            throw new Error("Persistent streams require Registry access")
        }
        if (user.isPrivate()) {
            let key = this.#fileKey

            let folderPath = "./" + registry.namespace + "/_STREAMS/" + key

            if (!fs.existsSync(folderPath)) {
                throw new Error("No streams are linked to this file")
            }

            let streamPath = folderPath + "/" + streamId;

            if (!fs.existsSync(streamPath)) {
                throw new Error("Stream " + streamId + " does not exist or has expired")
            }

            let file = new File(streamPath, this.#secret);

            let data = await file.read();

            let lines = data.split("\n")

            let ownerId = lines.shift()

            let userId = user.id()

            if (userId != ownerId) {
                throw new Error(userId + " does not own stream " + streamId);
            }

            return ownerId, file, lines;
        } else {
            throw new Error("Expected private access to user")
        }
    }

    async persistStreamNext(user, streamId) {
        let { ownerId, file, lines } = await this.#getData(user, streamId);

        let index = lines.shift();

        if (index != "undefined") {
            index = this.#dynamicIndex(Number(index));
        }

        let lineCount = Number(lines.shift());
        let statusNumber = lines.shift();

        if (statusNumber == "2") {
            throw new Error("Stream " + streamId + " has finished");
        }

        for (let i = 0; i < lineCount; i++) {
            lines.shift();
        }

        let newIndex;

        let second;

        if (statusNumber == "0") {
            let rawIndex = index.get();
            await index.destroy();
            let nextIndex = this.#dynamicIndex(rawIndex + lineCount);

            let next = await this.readLines(rawIndex, nextIndex.get() - 1);

            let length = next.length;

            if (length < lineCount) {
                if (length < 1) {
                    statusNumber = "2";
                } else {
                    statusNumber = "1";
                }
            }

            if (statusNumber == "0") {
                newIndex = String(nextIndex.get());
            } else {
                newIndex = "undefined";
            }

            await nextIndex.destroy();

            if (statusNumber != "2") {
                second = next;
            }
        }

        let newData = ownerId + "\n" + index + "\n" + String(lineCount) + "\n" + statusNumber + "\n" + lines.join("\n")

        if (second) {
            newData += "\n" + serializeStreamContents(lineCount, second);
        }

        file.write(newData);
    }

    async persistStreamGet(user, streamId) {
        let { _, __, lines } = await this.#getData(user, streamId);
        for (let i = 0; i < 3; i++) {
            lines.shift();
        }

        let data = [];

        for (let { _, line } of lines) {
            if (line != "") {
                data.push(removeNewlines(line));
            }
        }

        return data;
    }

    async persistStreamFinished(user, streamId) {
        let { _, __, lines } = await this.#getData(user, streamId);
        if (lines[2] == "2") {
            return true;
        } else {
            return false;
        }
    }

    path() {
        return this.#file;
    }
}

class File {
    constructor(file, secret) {
        this.#file = file;
        this.#secret = secret;
    };
    #file;
    #secret;
    read() {
        return decrypt(fs.readFileSync(this.#file).toString(), this.#secret);
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

async function handleSecret(user, type, id) {
    if (!user.isPrivate()) {
        throw new Error("Expected private access to user");
    }

    let secret;

    switch (type) {
        case "Conversation":
            let keychain = user.getKeychain();
            secret = await keychain.getSecret(id);
            break;
        default:
            throw new Error("Unknown stream type \"" + type + "\"")
            break;
    }

    return secret;
}

async function handleStreamData(user, type, data) {
    if (!user.isPrivate()) {
        throw new Error("Expected private access to user");
    }

    let formatted;

    switch (type) {
        case "Conversation":
            let keychain = user.getKeychain();
            secret = await keychain.getSecret(id);
            break;
        default:
            throw new Error("Unknown stream type \"" + type + "\"")
            break;
    }

    return formatted;
}

class Entry {
    constructor(registry, key, id, secret, ...args) {
        this.#registry = registry;
        let namespace = registry.namespace
        this.#namespace = namespace
        this.#key = key;
        this.#privateAccess = true;
        this.#id = id;
        let path = "./" + namespace + "/" + key + "/" + id + "/";
        let secretPath = path + "_SECRET";
        if (secret) {
            this.#secret = hasha(secret);
        }
        if (fs.existsSync(path)) {
            if (fs.existsSync(secretPath)) {
                let encrypted = fs.readFileSync(secretPath).toString();
                this.#privateAccess = compareSecret(secret, encrypted);
                if (this.#privateAccess) {
                    this.#privateAccess = true;
                }
            }
        } else {
            fs.mkdirSync(path);
            if (secret) {
                fs.writeFileSync(secretPath, encryptSecret(secret));
                if (!(key == "Friendships")) {
                    fs.mkdirSync(path + "Public/");
                }
            }
            switch (key) {
                case "Users":
                    fs.writeFileSync(path + "Keychain", "");
                    fs.writeFileSync(path + "Conversations", "");
                    fs.writeFileSync(path + "Friends", "");
                    fs.writeFileSync(path + "Public/Requests", "");
                    fs.writeFileSync(path + "Public/Invites", "");
                    fs.writeFileSync(path + "Public/Display Name", "");
                    fs.writeFileSync(path + "Public/Description", "");
                    fs.mkdirSync(path + "Streams/");
                    break;
                case "Conversations":
                    fs.writeFileSync(path + "Messages", "");
                    fs.writeFileSync(path + "Permissions", "");
                    fs.mkdirSync(path + "Profile/");
                    fs.writeFileSync(path + "Profile/Name", "");
                    fs.writeFileSync(path + "Profile/Description", "");
                    fs.mkdirSync(path + "Streams/");
                    break;
                case "Friendships":
                    fs.writeFileSync(path + "Participants", encrypt(args[0] + " " + args[1], this.#secret));
            }
        }

        this.#path = path;
    }

    #path;
    #secret;
    #registry;
    #namespace;
    #key;
    #privateAccess;
    #id;
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
    #expectClass(key) {
        if (this.#key != key) {
            throw new Error("Entry class of \"" + key + "\" expected, got \"" + this.#key + "\"");
        }
    }

    id() {
        return this.#id;
    }

    getKeychain() {
        this.#expectClass("Users")
        this.#checkAccess();
        let file = new PaginatedFile(this.#path + "Keychain", this.#secret);
        return new Keychain(file, "./" + this.#namespace + "/Conversations");
    };

    getOther(self) {
        this.#expectClass("Friendships")
        this.#checkAccess();
        let file = this.getFile("Participants").read();
        let split = file.split(" ");
        if (split[0] == self) {
            return split[1];
        } else {
            return split[0];
        }
    }

    getPagenatedFile(file) {
        this.#checkAccess();
        return new PaginatedFile(this.#path + file, this.#secret, this.#registry);
    }
    getFile(file) {
        this.#checkAccess();
        return new File(this.#path + file, this.#secret);
    }

    getPublicPagenatedFile(file) {
        this.#checkPublicity();
        return new PaginatedFile(this.#path + "Public/" + file, null, this.#registry);
    }
    getPublicFile(file) {
        this.#checkPublicity();
        return new File(this.#path + "Public/" + file);
    }

    //User framework

    async registerStream(file, type, id, lineCount) {
        this.#expectClass("Users")
        this.#checkAccess();
        let { streamId, fileKey } = await file.persistentStream(this, lineCount);

        let pointer = this.getFile("Streams/" + streamId);
        pointer.write(type + "-" + id + "/" + fileKey);

        await this.#registry.schedule.schedule(streamExpiry, "delete", "Users/" + this.#id + "/Streams/" + streamId);

        return streamId;
    }

    async #getFileFromStream(streamId) {
        this.#expectClass("Users")
        this.#checkAccess();
        let subpath = "Streams/" + streamId
        let path = this.#path + subpath;

        if (!fs.existsSync(path)) {
            throw new Error("Stream " + streamId + " has expired or does not exist");
        }

        let pointer = this.getFile("Streams/" + streamId)
        let data = pointer.read();

        let streamPath = data.split("/")

        let resourcePath = streamPath[0].split("-")

        let type = resourcePath[0];
        let id = resourcePath[1];

        let secret = await handleSecret(this, type, id);

        if (secret) {
            return new PaginatedFile(fromPathKey(streamPath[1]), secret), type;
        } else {
            throw new Error("Access not found for resource" + streamPath[0]);
        }
    }

    async streamNext(streamId) {
        let file = await this.#getFileFromStream(streamId);
        await file.persistStreamNext(this, streamId);
    }

    async streamFinished(streamId) {
        let file = await this.#getFileFromStream(streamId);
        return await file.persistStreamFinished(this, streamId);
    }

    async streamGet(streamId) {
        let { file, type } = await this.#getFileFromStream(streamId);
        let data = await file.persistStreamGet(this, streamId)
        return await handleStreamData(this, type, data)
    }

    //User

    async newConversation() {
        
    }

    isPrivate() {
        return this.#privateAccess;
    }
}

const PermissionLevels = {
    "0": "Blacklisted", //cant view
    "1": "Participant", //can chat
    "2": "Moderator", //can kick, ban, mute
    "3": "Owner" //can promote and demote mods, delete conversation, set community type
}

const MessageStatusIndex = {
    "0": "Delivered",
    "1": "Notified",
    "2": "Read"
}



//2 types of conversations:

//Group: creator is Owner
// types:
//  private: Inviter is inaccessible, replaced with Participant
//  public: Participant is inaccessible, replaced with Inviter

class Partition {
    constructor(registry, key) {
        this.#registry = registry;
        let namespace = registry.namespace;
        this.#namespace = namespace;
        this.#key = key;
        let path = "./" + namespace + "/" + key;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    get(id, secret) {
        return new Entry(this.#registry, this.#key, id, secret);
    }

    exists(id) {
        return fs.existsSync("./" + this.#namespace + "/" + this.#key + "/" + id + "/");
    }

    #registry;
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

function tick() {
    return Date.now();
}

class Schedule {
    constructor(file) {
        this.#file = file;
        this.#actions = {};
    };
    #file;
    #actions;
    async schedule(delay, action, ...args) {
        if (this.#actions[action]) {
            let schedTime = tick() + Math.round(delay * 1000);
            let file = this.#file;
            let stream = await file.stream(10);
            let index = await file.index(1);
            let finished = false;
            let find = async () => {
                for (let line of stream.read()) {
                    let split = line.split(" ");
                    let timestamp = Number(split.shift());
                    if (timestamp > schedTime) {
                        finished = true;
                        break
                    } else {
                        index.add(1);
                    }
                }
                if (!(stream.finished() || finished)) {
                    await stream.next();
                }
            }
            while (!(stream.finished() || finished)) {
                await find();
            }
            if (!finished) {
                await find();
            }
            if (!stream.finished()) {
                stream.destroy();
            }
            let schedEntry = String(schedTime) + " " + action + " " + JSON.stringify(args);
            if (file.isEmpty() || (!finished)) {
                await file.appendLine(schedEntry);
            } else {
                await file.insertLine(index.get(), schedEntry);
            }
            await index.destroy();
        } else {
            throw new Error("\"" + action + "\" is not a valid action")
        }
    };
    async update() {
        let file = this.#file;
        if (!file.isEmpty()) {
            let time = tick();
            let index = await file.index(1)
            let line = await file.readLine(index.get());
            let split = line.split(" ");
            let timestamp = Number(split.shift());
            if (timestamp < time) {
                let action = split.shift();
                let args = JSON.parse(split.join(" "));
                this.#actions[action].apply(null, args);
                await file.deleteLine(index.get());
            }
            await index.destroy();
        }
    };
    addAction(name, callback) {
        this.#actions[name] = callback;
    }
}

const authExpiry = 2592000;

class Registry {
    constructor(namespace) {
        this.#namespace = namespace;
        this.namespace = namespace;
        let path = "./" + namespace;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
            fs.mkdirSync(path + "/_AUTH/");
            fs.mkdirSync(path + "/_STREAMS/");
            fs.writeFileSync(path + "/_INCREMENT", "0");
        }
        this.schedule = new Schedule(new PaginatedFile(path + "/_SCHEDULE"));
        this.schedule.addAction("delete", (file) => {
            fs.unlinkSync("./" + namespace + "/" + file);
        })
        this.schedule.addAction("stream_expiry", (fileKey, streamId) => {
            let folder = "./" + namespace + "/_STREAMS/" + fileKey;
            fs.unlinkSync(folder + "/" + streamId);
            if (isFolderEmpty(folder)) {
                fs.rmdirSync(folder);
            }
        })
        this.update = bindThis(this.schedule, this.schedule.update);
        this.#watermark = namespace.toUpperCase()
    }

    get(key) {
        return new Partition(this, key);
    }

    #hashI() {
        let path = "./" + this.#namespace + "/_INCREMENT";
        let current = fs.readFileSync(path).toString();

        let unique = increment(current);

        fs.writeFileSync(path, unique);

        return unique;
    }

    hash() {
        return this.#watermark + "-" + this.#hashI() + "-" + hashR();
    }

    async registerSecret(id, secret) {
        let iid = this.#hashI();
        let key = hashR();
        let encrypted = encrypt(secret, key);
        let path = "_AUTH/" + iid
        fs.writeFileSync(path, id + "\n" + encrypted);
        await this.schedule.schedule(authExpiry, "delete", path);
        return this.#watermark + "-" + iid + "-" + key;
    }

    getUser(token) {
        let split = token.split("-");
        if (split.shift() == this.#watermark) {
            let iid = split[0];
            let path = "./" + this.#namespace + "/_AUTH/" + iid;
            if (fs.existsSync(path)) {
                let key = split[1];
                let file = new File(path);
                let contents = file.read();
                let authSplit = contents.split("\n")
                let userId = authSplit[0]
                let secret = "";
                try {
                    secret = decrypt(authSplit[1], key);
                } catch { }
                let user = this.get("Users").get(userId, secret);
                if (user.isPrivate()) {
                    return user;
                }
            }
        }
    }

    iid() {
        return this.#hashI();
    }

    #namespace;
    #watermark;
}

const acceptableUserLength = 3;
const maxUserLength = 30;
const acceptablePasswordLength = 5;
const maxPasswordLength = 50;
const acceptableUserChars = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    ".",
    "_",
    "-",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9"
]

class Usernames {
    constructor(file) {
        this.#file = file;
    }

    #file;

    async #iterate(callback) {
        let stopCommand = false;
        let stop = () => {
            stopCommand = true;
        }
        let loopCallback = callback(stop);

        let file = this.#file;

        let stream = await file.stream(10);
        let index = await file.index(1);

        while (!stopCommand) {
            let lines = stream.read();
            for (let line of lines) {
                let data = line.split(" ");
                loopCallback(index.get(), data[0], data[1]);
                if (stopCommand) {
                    break;
                } else {
                    index.add(1);
                }
            }
            if (stream.finished()) {
                stopCommand = true;
            } else if (!stopCommand) {
                await stream.next();
            }
        }

        if (!stream.finished()) {
            stream.destroy();
        }

        await index.destroy();
    }

    async addEntry(userId, username) {
        let idFound = false;
        let userFound = false;

        await this.#iterate((stop) => {
            return (_, thisId, thisUser) => {
                if (thisId == userId) {
                    idFound = true;
                    stop();
                } else if (thisUser == username) {
                    userFound = true;
                    stop();
                }
            }
        })

        if (idFound) {
            return "This user already exists!";
        } else if (userFound) {
            return "This username is taken!";
        } else {
            this.#file.appendToBeginning(userId + " " + username);
            return "Success!";
        }
    }

    async changeUsername(userId, username) {
        let index;
        let userFound = false;
        let repeatFound = false;

        await this.#iterate((stop) => {
            return (thisIndex, thisId, thisUser) => {
                if (thisId == userId) {
                    if (index) {
                        repeatFound = true;
                        stop();
                    } else {
                        index = this.#file.index(thisIndex);
                    }
                } else if (thisUser == username) {
                    userFound = true;
                    stop();
                }
            }
        })

        let status;

        if (index) {
            if (userFound) {
                status = "This username is taken!";
            } else if (repeatFound) {
                status = "A repeat of this user ID was found in the Usernames file.";
            } else {
                this.#file.writeLine(index.get(), userId + " " + username);
                status = "Success!";
            }

            index.destroy();
        } else {
            status = "This user does not exist!";
        }

        return status;
    }

    async getUsername(userId) {
        let username;

        await this.#iterate((stop) => {
            return (_, thisId, thisUser) => {
                if (thisId == userId) {
                    username = thisUser;
                    stop();
                }
            }
        })

        return username;
    }

    async getUserId(username) {
        let userId;

        await this.#iterate((stop) => {
            return (_, thisId, thisUser) => {
                if (thisUser == username) {
                    userId = thisId;
                    stop();
                }
            }
        })

        return userId;
    }
}

class FriendStream {
    constructor(friendships, file, userId) {
        this.#friendships = friendships;
    }

    #friendships;
    #stream;
    #index;
}

//PersistentStreams: global, local

/*

Stream file format:

POINTER (name: [Stream ID])
[Stream Type]/[File Key]

REMOTE CONTAINER (name: [Stream ID], parentDir: [File Key])
[Owner ID]
[Index]
[Increment]
[Finished]
[CONTENT]
[NEXT CONTENT]

File key
./Whisper/Users/2BFD/Conversations

turns into

4cc005ffee64e41b657b7824939ccec1c89d172dc4ad5a33876161cf08b474fb

*/

class PersistentStreams {
    constructor(registry, globalPath) {
        this.#registry = registry;
        this.#globalPath = globalPath;
    }

    newLocal(user, type, id) {

    }

    #registry
    #globalPath
}

class Whisper {
    constructor(namespace) {
        if (!namespace) {
            namespace = "Whisper";
        }
        this.#registry = new Registry(namespace);
        let userPath = "./" + namespace + "/Usernames"
        if (!fs.existsSync(userPath)) {
            fs.writeFileSync(userPath, "");
        }

        this.#registry.usernames = new Usernames(new PaginatedFile(userPath));
        this.update = this.#registry.update;

        let path = "./" + namespace + "/"

        this.debugRegistry = this.#registry;
    }

    #registry;

    #callbacks = {
        search: (() => {

        }),

        user: {
            new: (async (user, registry, username, password) => {
                if (!user) {
                    username = String(username);
                    username = username.toLowerCase();
                    password = String(password);
                    let userLength = username.length
                    if (userLength >= acceptableUserLength) {
                        if (userLength <= maxUserLength) {
                            let accepted = true;
                            for (let char of username.split("")) {
                                if (!acceptableUserChars.includes(char)) {
                                    accepted = false;
                                    break;
                                }
                            }
                            if (accepted) {
                                let passLength = password.length;
                                if (passLength >= acceptablePasswordLength) {
                                    if (passLength <= maxPasswordLength) {
                                        let id = registry.iid();
                                        let status = await registry.usernames.addEntry(id, username);
                                        if (status == "Success!") {
                                            try {
                                                let user = await registry.get("Users").get(id, password);
                                            } catch (err) {
                                                return { error: err };
                                            } finally {
                                                let token = await registry.registerSecret(id, password);
                                                return { auth: token };
                                            }
                                        } else {
                                            return { error: status };
                                        }
                                    } else {
                                        return { error: "Passwords cannot be longer than " + String(maxPasswordLength) + " characters!" };
                                    }
                                } else {
                                    return { error: "Passwords must be at least " + String(acceptablePasswordLength) + " characters long!" };
                                }
                            } else {
                                return { error: "Usernames can only contain " + acceptableUserChars.join(", ") + "!" };
                            }
                        } else {
                            return { error: "Usernames cannot be longer than " + String(maxUserLength) + " characters!" };
                        }
                    } else {
                        return { error: "Usernames must be at least " + String(acceptableUserLength) + " characters long!" };
                    }

                } else {
                    return { error: "You already have an account!" };
                }
            }),
            add: ((user, registry, otherUsername) => {

            }),
            requests: ((user, registry) => {

            }),
            friends: ((user, registry) => {

            }),
            login: (async (user, registry, username, password) => {
                if (!user) {
                    if (!((username != null) && (password != null))) {
                        return { error: "Missing parameters!" };
                    }
                    let userId = await registry.usernames.getUserId(username.toLowerCase());
                    if (userId) {
                        let user = await registry.get("Users").get(userId, password);
                        if (user.isPrivate()) {
                            let token = await registry.registerSecret(userId, password);
                            return { auth: token };
                        } else {
                            return { error: "Incorrect password!" };
                        }
                    } else {
                        return { error: "An account with this username does not exist!" };
                    }
                } else {
                    return { error: "You are already logged in!" }
                }
            }),
            get: ((user, registry, otherUsername) => {

            }),
            edit: {
                account: {
                    username: ((user, registry) => {

                    }),
                    password: ((user, registry) => {

                    })
                },
                profile: {
                    pfp: ((user, registry) => {

                    }),
                    displayName: ((user, registry) => {

                    }),
                    bio: ((user, registry) => {

                    })
                }
            },
        },

        conversation: {
            new: ((user, registry) => {

            }),
            list: ((user, registry) => {

            }),
            get: ((user, registry, conversation) => {

            }),
            users: ((user, registry, conversation) => {

            }),
            role: ((user, registry, conversation) => {

            }),
            messages: ((user, registry, conversation) => {

            }),
            send: ((user, registry, conversation, message) => {

            }),
            invite: ((user, registry, conversation, otherUsername) => {

            }),
            admin: {
                manage: {
                    changeRole: ((user, registry, conversation, otherUsername, roleLevel) => {

                    }),
                    mute: ((user, registry, conversation, otherUsername) => {

                    }),
                    kick: ((user, registry, conversation, otherUsername) => {

                    }),
                    ban: ((user, registry, conversation, otherUsername) => {

                    }),
                    unban: ((user, registry, conversation, otherUsername) => {

                    })
                },
                edit: {
                    pfp: ((user, registry, conversation) => {

                    }),
                    displayName: ((user, registry, conversation, newName) => {

                    }),
                    description: ((user, registry, conversation, newDesc) => {

                    })
                }
            },
        },

        message: {
            get: ((user, registry, message) => {

            }),
            status: ((user, registry, message) => {

            }),
            admin: {
                delete: ((user, registry, message) => {

                })
            }
        },

        stream: {
            get: ((user, registry, id) => {

            }),
            next: ((user, registry, id) => {

            }),
            finished: ((user, registry, id) => {

            })
        }
    }

    async call(method, auth, ...args) {
        let callback = this.#callbacks;
        let split = method.split("/")
        for (let key of split) {
            callback = callback[key];
            if (!callback) {
                break;
            }
        }
        if (!(callback instanceof Function)) {
            return { error: "This method does not exist." };
        }
        let user = this.#registry.getUser(auth);
        if (!user && method != "user/login") {
            return { error: "Invalid authentication." }
        }
        args.unshift(this.#registry);
        args.unshift(user || false);
        return await callback.apply(this, args);
    }
}

/*

REQUESTS:

- /search
- /user

    - /new
    - /get
    - /add
    - /login
    - /profile

        - /changePfp
        - /changeUsername
        - /changeDisplayName
        - /changePassword

- /conversations

    - /new
    - /list
    - /get
    - /users
    - /role
    - /messages
    - /send
    - /admin

        - /changeRole
        - /mute
        - /kick
        - /ban
        - /unban
        - /delete

- /message
get
    - /status
    - /admin

        - /delete

*/

// https://whisper.diamo.dev/api/

// https://whisper.diamo.dev/api/user/conversations/

// request: {auth: AUTH, instance: INSTANCE_ID, parameters: [any?...]}

const engine = new Whisper("Whisper");

module.exports.Registry = Registry;

const delay = (ms) => { return new Promise((res) => { setTimeout(res, ms) }) };

//WHISPER-2BFm-9lL1poTw7ThoOWLSw5CwkcijDBwp1GPeqiy1LAJHAIlmG8GLkGyHP7uav78dmmQA

(async () => {
    let test = new PaginatedFile("./Whisper/Persistent Stream.txt", null, engine.debugRegistry);
    await test.appendToBeginning("oohhhhh");

    let status = await engine.call("user/login", "WHISPER-2BFH-piiLpqot1tjA1o9Fmvfmu9HNWtq4wlcRa9xg1s0sC3m1QjDVFDTkhq3Ugb6BAhQD", "diamo", "")
    console.log(status);
    while (true) {
        engine.update();
        await delay(10);
    }
})()
