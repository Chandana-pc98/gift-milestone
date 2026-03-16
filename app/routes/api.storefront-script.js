/**
 * Public endpoint that serves the storefront JavaScript.
 * Injected via ScriptTag API into the store's theme.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;

  const script = `
(function() {
  "use strict";

  var GIFT_PROPERTY_KEY = "_gift_milestone";
  var isProcessing = false;
  var rulesCache = null;
  var rulesCacheTime = 0;
  var CACHE_TTL = 5 * 60 * 1000;

  function getShopDomain() {
    return window.Shopify && window.Shopify.shop ? window.Shopify.shop : "";
  }

  function fetchRules() {
    var shop = getShopDomain();
    if (!shop) return Promise.resolve([]);

    if (rulesCache && (Date.now() - rulesCacheTime) < CACHE_TTL) {
      return Promise.resolve(rulesCache);
    }

    return fetch("${appUrl}/api/rules?shop=" + encodeURIComponent(shop))
      .then(function(res) { return res.json(); })
      .then(function(data) {
        rulesCache = data.rules || [];
        rulesCacheTime = Date.now();
        return rulesCache;
      })
      .catch(function(err) {
        console.error("[GiftMilestone] Failed to fetch rules:", err);
        return [];
      });
  }

  function fetchCart() {
    return fetch("/cart.js", { headers: { "Accept": "application/json" } })
      .then(function(res) { return res.json(); })
      .catch(function(err) {
        console.error("[GiftMilestone] Failed to fetch cart:", err);
        return null;
      });
  }

  function addGiftToCart(variantId) {
    return fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{
          id: variantId,
          quantity: 1,
          properties: { _gift_milestone: "true" }
        }]
      })
    }).catch(function(err) {
      console.error("[GiftMilestone] Failed to add gift:", err);
    });
  }

  function removeGiftFromCart(lineKey) {
    return fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: 0 })
    }).catch(function(err) {
      console.error("[GiftMilestone] Failed to remove gift:", err);
    });
  }

  function evaluateCart() {
    if (isProcessing) return;
    isProcessing = true;

    Promise.all([fetchRules(), fetchCart()])
      .then(function(results) {
        var rules = results[0];
        var cart = results[1];

        if (!cart || !rules || rules.length === 0) {
          isProcessing = false;
          return;
        }

        var giftLines = [];
        var nonGiftSubtotal = 0;

        cart.items.forEach(function(item) {
          if (item.properties && item.properties[GIFT_PROPERTY_KEY] === "true") {
            giftLines.push(item);
          } else {
            nonGiftSubtotal += item.line_price;
          }
        });

        var giftVariantsInCart = {};
        giftLines.forEach(function(item) {
          giftVariantsInCart[item.variant_id] = item;
        });

        var cartChanged = false;
        var addPromises = [];
        var removePromises = [];

        rules.forEach(function(rule) {
          var thresholdCents = rule.thresholdAmount * 100;
          if (nonGiftSubtotal >= thresholdCents && !giftVariantsInCart[rule.variantNumericId]) {
            addPromises.push(addGiftToCart(rule.variantNumericId));
            cartChanged = true;
          }
        });

        giftLines.forEach(function(giftLine) {
          var matchedRule = null;
          rules.forEach(function(rule) {
            if (rule.variantNumericId === giftLine.variant_id) {
              matchedRule = rule;
            }
          });
          if (matchedRule) {
            var thresholdCents = matchedRule.thresholdAmount * 100;
            if (nonGiftSubtotal < thresholdCents) {
              removePromises.push(removeGiftFromCart(giftLine.key));
              cartChanged = true;
            }
          }
        });

        Promise.all(addPromises.concat(removePromises)).then(function() {
          isProcessing = false;
          if (cartChanged) {
            setTimeout(function() { window.location.reload(); }, 300);
          }
        });
      })
      .catch(function() {
        isProcessing = false;
      });
  }

  // Run on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", evaluateCart);
  } else {
    evaluateCart();
  }

  // Listen for cart change events
  document.addEventListener("cart:updated", function() {
    if (!isProcessing) evaluateCart();
  });

  // Intercept fetch to detect cart changes
  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var result = originalFetch.apply(this, args);
    var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";

    if ((url.indexOf("/cart/add") !== -1 || url.indexOf("/cart/change") !== -1 ||
         url.indexOf("/cart/update") !== -1) && !isProcessing) {
      result.then(function() {
        setTimeout(evaluateCart, 500);
      });
    }
    return result;
  };
})();
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
};
