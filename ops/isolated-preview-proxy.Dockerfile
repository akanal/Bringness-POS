FROM nginx:1.28-alpine
COPY ops/isolated-preview-proxy.conf /etc/nginx/nginx.conf
USER 101
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
