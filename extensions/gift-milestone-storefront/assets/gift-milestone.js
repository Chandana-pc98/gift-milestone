/**
 * Gift Milestone — Storefront Script
 *
 * Monitors the cart and automatically adds/removes gift products
 * when cart value meets or falls below configured thresholds.
 */
(function () {
  "use strict";

  const CACHE_KEY = "gift_milestone_rules";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const GIFT_PROPERTY_KEY = "_gift_milestone";
  let isProcessing = false;

  const banner = document.getElementById("gift-milestone-banner");
  if (!banner) return;

  const proxyUrl = banner.dataset.proxyUrl;
  const earningTemplate = banner.dataset.messageEarning || "Add {{amount_remaining}} more to get a FREE gift!";
  const earnedMessage = banner.dataset.messageEarned || "You've earned a FREE gift!";
  const messageEl = banner.querySelector(".gift-milestone__message");
  const progressFill = banner.querySelector(".gift-milestone__progress-fill");

  /**
   * Fetch milestone rules from the app proxy, with sessionStorage caching.
   */
  async function fetchRules() {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { rules, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          return rules;
        }
      } catch {
        // Cache corrupted, refetch
      }
    }

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) return [];
      const data = await response.json();
      const rules = data.rules || [];
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ rules, timestamp: Date.now() }),
      );
      return rules;
    } catch (err) {
      console.error("[GiftMilestone] Failed to fetch rules:", err);
      return [];
    }
  }

  /**
   * Fetch the current cart state from the Shopify AJAX API.
   */
  async function fetchCart() {
    try {
      const response = await fetch("/cart.js", {
        headers: { Accept: "application/json" },
      });
      return await response.json();
    } catch (err) {
      console.error("[GiftMilestone] Failed to fetch cart:", err);
      return null;
    }
  }

  /**
   * Add a gift variant to the cart.
   */
  async function addGiftToCart(variantNumericId) {
    try {
      await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: variantNumericId,
              quantity: 1,
              properties: { [GIFT_PROPERTY_KEY]: "true" },
            },
          ],
        }),
      });
    } catch (err) {
      console.error("[GiftMilestone] Failed to add gift:", err);
    }
  }

  /**
   * Remove a gift line item from the cart by its line item key.
   */
  async function removeGiftFromCart(lineKey) {
    try {
      await fetch("/cart/change.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lineKey, quantity: 0 }),
      });
    } catch (err) {
      console.error("[GiftMilestone] Failed to remove gift:", err);
    }
  }

  /**
   * Format a dollar amount for display.
   */
  function formatMoney(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  /**
   * Update the banner UI based on current cart state and rules.
   */
  function updateBanner(cartSubtotal, rules) {
    if (!rules || rules.length === 0) {
      banner.style.display = "none";
      return;
    }

    // Find the next unmet threshold (rules are sorted by threshold ascending)
    const nextRule = rules.find(
      (r) => cartSubtotal < r.thresholdAmount * 100,
    );

    // Find the highest met threshold
    const metRules = rules.filter(
      (r) => cartSubtotal >= r.thresholdAmount * 100,
    );

    banner.style.display = "block";

    if (nextRule) {
      // Show progress toward next gift
      const thresholdCents = nextRule.thresholdAmount * 100;
      const remaining = thresholdCents - cartSubtotal;
      const progress = Math.min((cartSubtotal / thresholdCents) * 100, 100);

      progressFill.style.width = progress + "%";
      messageEl.textContent = earningTemplate.replace(
        "{{amount_remaining}}",
        formatMoney(remaining),
      );
      banner.classList.remove("gift-earned");
    } else if (metRules.length > 0) {
      // All thresholds met
      progressFill.style.width = "100%";
      messageEl.textContent = earnedMessage;
      banner.classList.add("gift-earned");
    }
  }

  /**
   * Main logic: evaluate cart against rules and add/remove gifts.
   */
  async function evaluateCart() {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const [rules, cart] = await Promise.all([fetchRules(), fetchCart()]);
      if (!cart || !rules || rules.length === 0) {
        if (banner) banner.style.display = "none";
        return;
      }

      // Identify gift lines and calculate non-gift subtotal
      const giftLines = [];
      let nonGiftSubtotal = 0; // in cents

      for (const item of cart.items) {
        if (item.properties && item.properties[GIFT_PROPERTY_KEY] === "true") {
          giftLines.push(item);
        } else {
          nonGiftSubtotal += item.line_price;
        }
      }

      // Build a set of gift variant IDs currently in the cart
      const giftVariantsInCart = new Set(
        giftLines.map((item) => item.variant_id),
      );

      let cartChanged = false;

      // Add gifts for met thresholds that aren't already in the cart
      for (const rule of rules) {
        const thresholdCents = rule.thresholdAmount * 100;
        if (
          nonGiftSubtotal >= thresholdCents &&
          !giftVariantsInCart.has(rule.variantNumericId)
        ) {
          await addGiftToCart(rule.variantNumericId);
          cartChanged = true;
        }
      }

      // Remove gifts for thresholds that are no longer met
      for (const giftLine of giftLines) {
        const rule = rules.find(
          (r) => r.variantNumericId === giftLine.variant_id,
        );
        if (rule) {
          const thresholdCents = rule.thresholdAmount * 100;
          if (nonGiftSubtotal < thresholdCents) {
            await removeGiftFromCart(giftLine.key);
            cartChanged = true;
          }
        }
      }

      // Update the banner
      updateBanner(nonGiftSubtotal, rules);

      // If we changed the cart, refresh the page to reflect updates
      if (cartChanged) {
        // Small delay to let Shopify process the cart change
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
    } finally {
      isProcessing = false;
    }
  }

  // Run on page load
  evaluateCart();

  // Listen for theme cart events (Dawn and similar themes dispatch these)
  document.addEventListener("cart:updated", evaluateCart);

  // Also watch for AJAX-driven cart updates via fetch interception
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const result = originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

    if (
      url.includes("/cart/add") ||
      url.includes("/cart/change") ||
      url.includes("/cart/update") ||
      url.includes("/cart/clear")
    ) {
      // Only re-evaluate if the cart change wasn't triggered by us
      if (!isProcessing) {
        result.then(() => {
          setTimeout(evaluateCart, 500);
        });
      }
    }

    return result;
  };
})();
