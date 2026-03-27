import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "@/store/useStore";

// Helper to reset store state between tests
function resetStore() {
  const { logout } = useStore.getState();
  logout();
}

describe("Piggy (locked funds) per-user isolation", () => {
  beforeEach(() => {
    resetStore();
  });

  it("should allow each user to have their own piggy savings", async () => {
    // Register two users
    let store = useStore.getState();
    store.registerUser({
      id: "u1",
      firstName: "Alice",
      lastName: "A",
      phone: "111",
      email: "alice@example.com",
      age: "25",
      username: "alice",
      pin: "1234",
      password: "pw1",
      accountNumber: "001",
      walletId: "w1",
      createdAt: new Date().toISOString(),
      faceVerified: false,
      piggyActivated: true,
    });
    store = useStore.getState();
    store.logout();
    store = useStore.getState();
    store.registerUser({
      id: "u2",
      firstName: "Bob",
      lastName: "B",
      phone: "222",
      email: "bob@example.com",
      age: "30",
      username: "bob",
      pin: "5678",
      password: "pw2",
      accountNumber: "002",
      walletId: "w2",
      createdAt: new Date().toISOString(),
      faceVerified: false,
      piggyActivated: true,
    });

    // Bob creates a piggy plan
    store = useStore.getState();
    let result = await store.createLockedFund({ name: "Bob's Piggy", amount: 1000, unlockDate: "2026-04-01", pin: "5678" });
    store = useStore.getState();
    expect(result.success).toBe(true);
    expect(store.currentUser?.lockedFunds?.length).toBe(1);
    expect(store.currentUser?.lockedFunds?.[0].name).toBe("Bob's Piggy");

    // Switch to Alice
    store = useStore.getState();
    store.logout();
    store = useStore.getState();
    store.login("111", "pw1");
    store = useStore.getState();
    expect(store.currentUser?.lockedFunds?.length ?? 0).toBe(0);
    // Alice creates her own piggy
    result = await store.createLockedFund({ name: "Alice's Piggy", amount: 500, unlockDate: "2026-04-01", pin: "1234" });
    store = useStore.getState();
    expect(result.success).toBe(true);
    expect(store.currentUser?.lockedFunds?.length).toBe(1);
    expect(store.currentUser?.lockedFunds?.[0].name).toBe("Alice's Piggy");

    // Switch back to Bob
    store = useStore.getState();
    store.logout();
    store = useStore.getState();
    store.login("222", "pw2");
    store = useStore.getState();
    expect(store.currentUser?.lockedFunds?.length).toBe(1);
    expect(store.currentUser?.lockedFunds?.[0].name).toBe("Bob's Piggy");
  });
});
