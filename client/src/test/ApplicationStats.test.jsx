
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect, useState } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ApplicationStats from "../pages/ApplicationStats";
const mockStats = {
  total: 6,
  byStatus: {
    Applied: 3,
    "Under Review": 1,
    Interview: 1,
    Offered: 1,
    Rejected: 0,
  },
};

describe("US-12 Application Statistics Dashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockStats,
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows the loading state", () => {
  render(<ApplicationStats />);

  expect(
    screen.getByText("Loading application statistics...")
  ).toBeInTheDocument();
});

  it("displays all six summary cards", async () => {
    render(<ApplicationStats />);

    expect(
      await screen.findByText("Total Applications")
    ).toBeInTheDocument();

    const summary = screen.getByRole("region", {
      name: "Application summary",
    });

    expect(summary).toHaveTextContent("6");
    expect(summary).toHaveTextContent("Applied");
    expect(summary).toHaveTextContent("Under Review");
    expect(summary).toHaveTextContent("Interviews");
    expect(summary).toHaveTextContent("Offers");
    expect(summary).toHaveTextContent("Rejected");
  });

  it("displays the correct chart percentages", async () => {
    render(<ApplicationStats />);

    expect(
      await screen.findByText("Applications by Status")
    ).toBeInTheDocument();

    const appliedBar = screen.getByRole("progressbar", {
      name: "Applied",
    });

    expect(appliedBar).toHaveAttribute("aria-valuenow", "3");
    expect(appliedBar).toHaveAttribute("aria-valuemax", "6");

    expect(
      screen.getByText("3 (50%)")
    ).toBeInTheDocument();

    expect(
      screen.getAllByText("1 (17%)")
    ).toHaveLength(3);
  });

  it("displays empty states when there are no applications", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        total: 0,
        byStatus: {
          Applied: 0,
          "Under Review": 0,
          Interview: 0,
          Offered: 0,
          Rejected: 0,
        },
      }),
    });

    render(<ApplicationStats />);

    expect(
      await screen.findByText(
        "You haven't submitted any applications yet."
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText("No application data available yet.")
    ).toBeInTheDocument();
  });

  it("shows an error when the API request fails", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<ApplicationStats />);

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to load application statistics."
    );
  });

  it("sends the user's authentication token", async () => {
    render(<ApplicationStats />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/applications/stats"),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer test-token",
          },
        })
      );
    });
  });
});
