-- Optional label for carrier (UI + API). Run once against your app database.
ALTER TABLE offers
  ADD COLUMN carrier_name VARCHAR(255) NULL DEFAULT NULL
  AFTER billing_flow;
