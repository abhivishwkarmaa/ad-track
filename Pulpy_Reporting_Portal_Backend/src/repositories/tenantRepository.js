export class TenantRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findBySlug(slug) {
    const [rows] = await this.pool.query(
      "SELECT id, name, slug, status, created_at FROM tenants WHERE slug = ? LIMIT 1",
      [slug],
    );
    return rows[0] || null;
  }

  async findById(id) {
    const [rows] = await this.pool.query(
      "SELECT id, name, slug, status, created_at FROM tenants WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] || null;
  }
}
