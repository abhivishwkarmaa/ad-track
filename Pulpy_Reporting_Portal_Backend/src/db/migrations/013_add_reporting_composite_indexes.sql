-- Improve detailed report performance for grouped month-range queries.
-- Focus: tenant + date + grouping dimensions (publisher_id / offer_id / pair).

ALTER TABLE clicks
  ADD INDEX idx_clicks_tenant_pub_created_ip (tenant_id, publisher_id, created_at, ip),
  ADD INDEX idx_clicks_tenant_offer_created_ip (tenant_id, offer_id, created_at, ip),
  ADD INDEX idx_clicks_tenant_pub_offer_created (tenant_id, publisher_id, offer_id, created_at),
  -- Supports month-range group by offer+publisher with date window scan
  ADD INDEX idx_clicks_tenant_created_offer_pub (tenant_id, created_at, offer_id, publisher_id);

ALTER TABLE conversions
  ADD INDEX idx_conversions_tenant_pub_created_status (tenant_id, publisher_id, created_at, status),
  ADD INDEX idx_conversions_tenant_offer_created_status (tenant_id, offer_id, created_at, status),
  ADD INDEX idx_conversions_tenant_pub_offer_created_status (tenant_id, publisher_id, offer_id, created_at, status),
  -- Supports month-range group by offer+publisher with date window scan
  ADD INDEX idx_conversions_tenant_created_offer_pub_status (tenant_id, created_at, offer_id, publisher_id, status);
