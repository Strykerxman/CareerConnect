
const request = require("supertest");

jest.mock("../src/db", () => ({
  getDb: jest.fn(),
}));

const { getDb } = require("../src/db");
const { createApp } = require("../src/app");
const { signToken } = require("../src/middleware/auth");

describe("US-12 Application Statistics API", () => {
  const app = createApp();

  const jobSeekerToken = signToken({
    id: 1,
    role: "job_seeker",
  });

  const recruiterToken = signToken({
    id: 2,
    role: "recruiter",
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockStats(rows) {
    const all = jest.fn().mockReturnValue(rows);
    const prepare = jest.fn().mockReturnValue({ all });

    getDb.mockReturnValue({ prepare });

    return { prepare, all };
  }

  test("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get("/api/applications/stats");

    expect(response.status).toBe(401);
  });

  test("rejects recruiters", async () => {
    const response = await request(app)
      .get("/api/applications/stats")
      .set("Authorization", `Bearer ${recruiterToken}`);

    expect(response.status).toBe(403);
  });

  test("returns the correct total and status counts", async () => {
    mockStats([
      { status: "Applied", count: 3 },
      { status: "Interview", count: 2 },
      { status: "Rejected", count: 1 },
    ]);

    const response = await request(app)
      .get("/api/applications/stats")
      .set("Authorization", `Bearer ${jobSeekerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: 6,
      byStatus: {
        Applied: 3,
        "Under Review": 0,
        Interview: 2,
        Offered: 0,
        Rejected: 1,
      },
    });
  });

  test("returns zeros when there are no applications", async () => {
    mockStats([]);

    const response = await request(app)
      .get("/api/applications/stats")
      .set("Authorization", `Bearer ${jobSeekerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.byStatus).toEqual({
      Applied: 0,
      "Under Review": 0,
      Interview: 0,
      Offered: 0,
      Rejected: 0,
    });
  });

  test("filters the statistics query by user ID", async () => {
    const { prepare, all } = mockStats([
      { status: "Applied", count: 2 },
    ]);

    const response = await request(app)
      .get("/api/applications/stats")
      .set("Authorization", `Bearer ${jobSeekerToken}`);

    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+user_id\s*=\s*\?/i)
    );
    expect(all).toHaveBeenCalledWith(1);
  });
});
