CREATE USER users_app WITH PASSWORD 'users_local_password';
CREATE USER products_app WITH PASSWORD 'products_local_password';
CREATE USER reviews_app WITH PASSWORD 'reviews_local_password';

CREATE DATABASE users_db OWNER users_app;
CREATE DATABASE products_db OWNER products_app;
CREATE DATABASE reviews_db OWNER reviews_app;

REVOKE CONNECT ON DATABASE users_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE products_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE reviews_db FROM PUBLIC;

GRANT CONNECT ON DATABASE users_db TO users_app;
GRANT CONNECT ON DATABASE products_db TO products_app;
GRANT CONNECT ON DATABASE reviews_db TO reviews_app;