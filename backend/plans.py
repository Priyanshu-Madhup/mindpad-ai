"""
plans.py — Mindpad AI subscription plans API.
Handles plan definitions, coupon validation, and (future) payment gateway integration.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/plans", tags=["plans"])

# ── Plan definitions ────────────────────────────────────────────────────────────

PLANS = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_inr": 0,
        "storage_mb": 50,
        "ai_model": "standard",
        "accuracy_multiplier": 1,
        "deep_research_daily": 5,
        "image_gen_daily": 5,
        "ai_studio": "basic",
        "languages": 10,
    },
    "plus": {
        "id": "plus",
        "name": "Plus",
        "price_inr": 49,
        "storage_mb": 200,
        "ai_model": "better",
        "accuracy_multiplier": 2,
        "deep_research_daily": -1,   # unlimited
        "image_gen_daily": 50,
        "ai_studio": "expanded",
        "languages": 12,
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_inr": 99,
        "storage_mb": 500,
        "ai_model": "best",
        "accuracy_multiplier": 3,
        "deep_research_daily": -1,   # unlimited
        "image_gen_daily": -1,       # unlimited
        "ai_studio": "full",
        "languages": 12,
    },
}

# ── Coupon definitions ──────────────────────────────────────────────────────────
# Each coupon: { discount_pct, applies_to (list of plan ids or ["all"]), active }

COUPONS: dict[str, dict] = {
    "MINDPAD20": {"discount_pct": 20, "applies_to": ["all"], "active": True},
    "PLUS10":    {"discount_pct": 10, "applies_to": ["plus"],  "active": True},
    "PRO15":     {"discount_pct": 15, "applies_to": ["pro"],   "active": True},
}


# ── Schemas ─────────────────────────────────────────────────────────────────────

class CouponRequest(BaseModel):
    code: str
    plan_id: str  # "plus" | "pro"

class CouponResponse(BaseModel):
    valid: bool
    discount_pct: int = 0
    message: str = ""

class PurchaseRequest(BaseModel):
    plan_id: str
    coupon_code: Optional[str] = None
    # Payment gateway fields will be added here when integrating Razorpay / Stripe
    payment_token: Optional[str] = None


# ── Routes ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_plans():
    """Return all available subscription plans."""
    return {"plans": list(PLANS.values())}


@router.get("/{plan_id}")
async def get_plan(plan_id: str):
    """Return details for a specific plan."""
    plan = PLANS.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found.")
    return plan


@router.post("/validate-coupon", response_model=CouponResponse)
async def validate_coupon(body: CouponRequest):
    """Validate a coupon code for a given plan."""
    code   = body.code.strip().upper()
    coupon = COUPONS.get(code)

    if not coupon or not coupon["active"]:
        return CouponResponse(valid=False, message="Invalid or expired coupon code.")

    applies_to = coupon["applies_to"]
    if "all" not in applies_to and body.plan_id not in applies_to:
        return CouponResponse(
            valid=False,
            message=f"This coupon is not valid for the {body.plan_id.title()} plan.",
        )

    return CouponResponse(
        valid=True,
        discount_pct=coupon["discount_pct"],
        message=f"{coupon['discount_pct']}% discount applied!",
    )


@router.post("/purchase")
async def purchase_plan(body: PurchaseRequest):
    """
    Initiate a plan purchase.
    Payment gateway (Razorpay / Stripe) integration goes here.
    Currently returns a placeholder response.
    """
    if body.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {body.plan_id}")

    plan = PLANS[body.plan_id]

    # Validate coupon if provided
    discount_pct = 0
    if body.coupon_code:
        code   = body.coupon_code.strip().upper()
        coupon = COUPONS.get(code)
        if coupon and coupon["active"]:
            applies_to = coupon["applies_to"]
            if "all" in applies_to or body.plan_id in applies_to:
                discount_pct = coupon["discount_pct"]

    base_price    = plan["price_inr"]
    discount_amt  = round(base_price * discount_pct / 100)
    final_price   = base_price - discount_amt

    # TODO: pass final_price to payment gateway and return payment_url / order_id
    return {
        "status": "pending_payment_gateway",
        "plan_id": body.plan_id,
        "base_price_inr": base_price,
        "discount_pct": discount_pct,
        "discount_amt_inr": discount_amt,
        "final_price_inr": final_price,
        "message": "Payment gateway integration coming soon.",
    }
