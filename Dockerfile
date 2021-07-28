FROM alpine:3.12

COPY / /app

RUN apk add nodejs npm ;\
    cd /app ; npm install --production ;\
    apk del npm

EXPOSE 8082/tcp
VOLUME /app/db

ENTRYPOINT /app/server.js