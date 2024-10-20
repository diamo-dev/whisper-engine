# Whisper Engine

## Introduction

Development of a chat service backend designed to be run on node.js. It has basic features such as encryption.
It probably has some problems but at least the datas encrypted. My thought process is along the lines of "if it breaks oh well. the users data is secure so who cares."
Last thing I want is to be responsible for compromising private conversation data.

## Security

Keys stored in memory, not on disk. If disk compromised, there should be no conversation data.
If theres anyone qualified, reach out to me if theres any vulnurabilities.

## Progress

**Alpha v0.5 released!**
- Persistent streams finished. All that's left for the backend is making chat logic.
- Engine interaction layer complete.
- Backend officially halfway done!
