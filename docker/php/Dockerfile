FROM php:8.3-fpm-alpine
RUN apk add --no-cache ghostscript imagemagick imagemagick-dev libwebp-dev $PHPIZE_DEPS \
    && docker-php-ext-install pdo_mysql \
    && pecl install imagick && docker-php-ext-enable imagick \
    && apk del $PHPIZE_DEPS
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
RUN echo "upload_max_filesize=100M" > /usr/local/etc/php/conf.d/uploads.ini \
    && echo "post_max_size=110M" >> /usr/local/etc/php/conf.d/uploads.ini
WORKDIR /var/www/html
