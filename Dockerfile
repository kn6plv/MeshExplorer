FROM alpine:3.12

COPY app /app
COPY minkebox /minkebox

RUN apk add nodejs npm ;\
    cd /app ; npm install --production ;\
    chmod 777 server.js ;\
    apk del npm

EXPOSE 8082/tcp
VOLUME /app/db

ENTRYPOINT /app/server.js
