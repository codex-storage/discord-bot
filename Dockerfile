# Variables
ARG BUILDER=node:20-alpine
ARG IMAGE=${BUILDER}
ARG APP_USER=root
ARG APP_HOME=/app


# Build
FROM ${BUILDER} AS builder

ARG APP_USER
ARG APP_HOME

WORKDIR ${APP_HOME}
COPY --chown=${APP_USER}:${APP_USER} . .

RUN npm install


# Create
FROM ${IMAGE}

ARG APP_USER
ARG APP_HOME

WORKDIR ${APP_HOME}
COPY --chown=${APP_USER}:${APP_USER} --from=builder ${APP_HOME} .

CMD [ "node", "index.js" ]
