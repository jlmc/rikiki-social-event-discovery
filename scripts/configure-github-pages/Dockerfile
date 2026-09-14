FROM alpine:3.20

# github-cli (gh) and git are both packaged in Alpine's community repo —
# no need to add apt/deb repositories or GPG keys for a one-off task.
RUN apk add --no-cache github-cli bash

WORKDIR /work
COPY lib.sh /usr/local/lib/gh-pages/lib.sh
COPY configure.sh /usr/local/bin/configure.sh
COPY trigger.sh /usr/local/bin/trigger.sh
COPY set-email-secrets.sh /usr/local/bin/set-email-secrets.sh
RUN chmod +x /usr/local/bin/configure.sh /usr/local/bin/trigger.sh /usr/local/bin/set-email-secrets.sh

ENTRYPOINT ["/usr/local/bin/configure.sh"]
