# Changelog

All notable changes to the screensy project will be documented in this file.

The format is based on [Keep a Changelog], and this project adheres to
[Semantic Versioning].

## 1.9.0 - 2023-02-07

### Added

-   Add the French translation.

## 1.8.0 - 2022-05-09

### Added

-   Add the Portuguese translation.

## 1.7.1 - 2022-03-28

### Fixed

-   The message shown if the user does not have JavaScript enabled will now be
    styled correctly.

## 1.7.0 - 2021-11-19

### Added

-   Add the Chinese translation.

## 1.6.1 - 2021-11-16

### Added

-   Add license information to the client code. As a result, the
    [LibreJS browser extension] will not block the JavaScript code anymore.

### Fixed

-   Fix compilation failure for TypeScript version 4.4.2.

## 1.6.0 - 2021-10-05

### Added

-   Add the Czech translation.

## 1.5.0 - 2021-10-03

### Added

-   Add the German translation.

## 1.4.0 - 2021-09-17

### Added

-   Add the Japanese translation.

## 1.3.1 - 2021-09-09

### Security

-   In previous versions the rendezvous server would crash whenever it received an
    invalid JSON message. This is now fixed: such messages are now discarded.

## 1.3.0 - 2021-08-05

### Added

-   Add the Hebrew translation.
-   Add a TRANSLATORS file.

## 1.2.0 - 2021-08-02

### Added

-   Add localisation based on the browser settings (through the Accept-Language
    header).
-   Add the Dutch translation.

### Changed

-   In the client, the stream is no longer locked to full-screen on mobile
    devices.
-   In the client, more detailed error messages are shown when something goes
    wrong.

### Fixed

-   Fix compilation failure for TypeScript version greater than 4.3.2.

### Security

-   Update the dependency 'ws' of the rendezvous server. The old version had a
    [vulnerability] that can be misused to significantly slow down a webSocket
    server.

## 1.1.0 - 2021-06-07

### Added

-   Include a STUN+TURN server in the Docker setup.

### Changed

-   The client now assumes that a STUN or TURN server is hosted on the same domain
    as screensy. Previously, the client used an external STUN server, which is an
    unreliable solution. Also, the client did not use a TURN server.

## 1.0.3 - 2021-06-06

### Fixed

-   Add words to the list that the client uses to generate room names. This
    decreases the chance that two broadcasters happen to generate the same room
    name.

## 1.0.2 - 2021-06-03

### Fixed

-   Fix the failing build of the screensy-website Docker image. This happened
    because we did not specify a version of the TypeScript compiler.

## 1.0.1 - 2021-03-18

### Changed

-   Previously, the website client always used WebSocket Secure for a connection
    to the rendezvous server. Now, the client uses WebSocket if the website is
    served via HTTP, and WebSocket Secure if the website is served via HTTPS.

### Added

-   Screensy can now be hosted on a path that is not the root path.

## 1.0.0 - 2021-03-16

### Added

-   Add the website.
-   Add the rendezvous (signaling) server.
-   Add Dockerfiles and a docker-compose file for easy deployment with Docker.
-   Add a README with instructions on setting up screensy.
-   Add this CHANGELOG.

[keep a changelog]: https://keepachangelog.com/en/1.0.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html
[librejs browser extension]: https://www.gnu.org/software/librejs/
[vulnerability]: https://www.npmjs.com/advisories/1748
