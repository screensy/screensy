# screensy

| Authors                          | Date             |
| -------------------------------- | ---------------- |
| Stef Gijsberts, Marijn van Wezel | March 17th, 2022 |

Screensy is a simple screen sharing solution. Nothing more, nothing less.

It consists of two parts, the rendezvous part which runs on the server, and the
website part which runs in the user's browser. The rendezvous server is only
used for protocol negotiation and discovery of viewers. The video stream is
directly sent from the browser of the broadcaster to the browser of each viewer.
All traffic (between rendezvous and browser and between browsers) is encrypted
by default.

There are two ways to set up screensy. If you don't know which one to choose, we
recommend using Docker.

## Server Setup (With Docker)

1.  Follow this guide to install Docker on your machine:

    https://docs.docker.com/engine/install/

2.  Follow this guide to install Docker Compose on your machine:

    https://docs.docker.com/compose/install/

3.  Clone this repository and navigate to it, using the following commands:

        git clone https://github.com/screensy/screensy.git
        cd screensy/

4.  Change the first line of the included Caddyfile to your domain. For example
    if you want to host screensy on the domain "example.com", use this
    Caddyfile:

        example.com {
            reverse_proxy website:80

            @rendezvous {
                header Connection *Upgrade*
                header Upgrade websocket
            }

            reverse_proxy @rendezvous rendezvous:4000
        }

5.  _Optional_: password-protect your screensy instance using the method
    described at the bottom of this document.

6.  Change the value of the "external-ip" setting in the included
    "turnserver.conf" from "localhost" to your domain. For example if you want
    to host screensy on the domain "example.com", the first two lines of your
    "turnserver.conf" should look like this:

        # Set the value below to your public IP address or domain.
        external-ip=example.com

7.  Make sure the required ports are accessible. We listed these ports at the
    bottom of this document.

8.  Start the Docker containers using Docker Compose, by running the following
    command:

        docker-compose up -d

## Server Setup (Without Docker)

1.  Make sure you have the following software installed on your server:

    -   NodeJS
    -   A TypeScript compiler
    -   A Go compiler
    -   A reverse proxy that supports WebSocket (we recommend Caddy)
    -   A STUN server (we recommend Coturn)
    -   A TURN server (again, we recommend Coturn)

2.  Clone this repository and navigate to it, using the following commands:

        git clone https://github.com/screensy/screensy.git
        cd screensy/

3.  Install the required development dependencies for the rendezvous server,
    using the following command:

        cd screensy-rendezvous && npm install --only=development && cd ..

4.  Compile the TypeScript files in both the "screensy-rendezvous" as well as
    the "screensy-website" directory, using the following commands:

        cd screensy-rendezvous && tsc && cd ..
        cd screensy-website && tsc && cd ..

5.  Install the required dependencies for the webserver, using the following
    command:

        cd screensy-website && go get . && cd ..

6.  Make sure the required ports are accessible. We listed these ports at the
    bottom of this document.

7.  Start the webserver using the following command:

        cd screensy-website && go run main.go

    This starts the webserver on port 8080. We do not use the standard port "80"
    for this, as it will conflict with the reverse proxy we will set up in step 10.

8.  Set up the STUN and TURN server. Use the long-term credential mechanism
    with the username "screensy" and the password "screensy". We use the
    following "turnserver.conf" for this:

        external-ip=example.com
        listening-port=3478
        user=screensy:screensy
        lt-cred-mech
        realm=screensy

9.  Start the rendezvous server located in "screensy-rendezvous" directory,
    using the following commands:

        cd screensy-rendezvous
        npm install --only=production
        node server.js

    This starts a WebSocket server on port 4000.

10. Reverse proxy both the static file server and the rendezvous server. We use
    the following Caddyfile for this:

        example.com {
            reverse_proxy localhost:8080

            @rendezvous {
                header Connection *Upgrade*
                header Upgrade websocket
            }

            reverse_proxy @rendezvous localhost:4000
        }

    Keep in mind that most web browsers require HTTPS for WebRTC to work.

## Optional: password-protect your screensy instance

To password-protect your screensy instance, you can set up HTTP Basic
Authentication.

1.  Choose a username and password.

2.  Calculate a hash for your password using the following command:

        caddy hash-password

    The command will ask you for a password and will then give you a hash. Make
    sure to copy this hash, because you need it in the next step.

3.  Uncomment the following lines in the Caddyfile, and replace the username and
    hash.

        basicauth {
            <username> <hash>
        }

    So for example, to protect the instance with the username 'alice' and the
    password 'insecure', use:

        basicauth {
            alice JDJhJDE0JDhkSmdoNy9BZ3BlZlRmSkFROHRUTE9jMW5jV1pUMVdZcW92WFdLVGZTcmFsL3RoeFR4OVlH
        }

4.  _Optional, more advanced_: You can add more username-hash pairs, or
    exclude certain IP adresses from needing authentication. For example, the
    following lines protect the instance with the username 'alice' and the
    password 'insecure', and the username 'bob' and the password 'unsafe', and
    exclude local IP addresses from needing authentication:

        @needauth {
            # Non-local IPs need authentication
            not remote_ip 192.168.0.0/16 172.16.0.0/12 10.0.0.0/8
        }

        basicauth @needauth {
            alice JDJhJDE0JDhkSmdoNy9BZ3BlZlRmSkFROHRUTE9jMW5jV1pUMVdZcW92WFdLVGZTcmFsL3RoeFR4OVlH
            bob JDJhJDE0JGJIZFRNNDVDOUVGN0pkLjdnc05CSXU4dGdKU2VvWFBKZUpjY0c3aFhRLldKYTRwNjVBYzVT
        }

## Ports

The following ports need to be accessible by the client for screensy to work:

| Port number | Protocol | Service   |
| ----------- | -------- | --------- |
| 80          | TCP      | HTTP      |
| 443         | TCP      | HTTPS     |
| 3478        | TCP/UDP  | STUN/TURN |
| 49152-65535 | UDP      | TURN      |
