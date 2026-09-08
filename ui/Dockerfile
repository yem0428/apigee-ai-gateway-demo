FROM nginx:alpine

ENV PORT=8080
ENV NGINX_ENVSUBST_FILTER="PORT"

# Copy NGINX configuration template
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy runtime environment generator script to entrypoint
COPY generate-env.sh /docker-entrypoint.d/40-generate-env.sh
RUN chmod +x /docker-entrypoint.d/40-generate-env.sh

# Copy pre-built SPA production assets
COPY dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
