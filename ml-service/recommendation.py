import random
import math
from collections import defaultdict


# -------- CATEGORY WEIGHTS -------- #
# All 6 taxonomy categories are weighted.
# Subject and style drive discovery the most on a creative platform.
# Mood and color_palette are softer signals but matter for vibe-matching.
CATEGORY_WEIGHTS = {
    "medium":             0.15,
    "subject":            0.25,
    "style":              0.25,
    "mood":               0.15,
    "color_palette":      0.10,
    "aesthetic_features": 0.10,
}

# How many posts in the final FYP are "serendipity" picks —
# intentionally dissimilar to the user's taste to drive discovery.
SERENDIPITY_RATIO = 0.10

# Tag repetition decay — if the user has already seen a tag N times
# in this feed generation, confidence contribution is multiplied by this.
TAG_DECAY_FACTOR = 0.5


# -------- USER AFFINITY VECTOR -------- #

def build_user_affinity(interaction_history):
    """
    Build a tag-level affinity map from a user's interaction history.

    interaction_history: list of dicts, each with:
        - 'tags': the post's tag dict (same shape as /analyze output)
        - 'weight': interaction strength
            e.g. 1.0 = liked, 1.5 = saved, 0.3 = watched >50%, -0.5 = skipped

    Returns:
        affinity: { category: { tag_label: score } }
        A weighted accumulation of tag confidences across all interactions.
    """
    affinity = defaultdict(lambda: defaultdict(float))

    for interaction in interaction_history:
        weight = interaction.get("weight", 1.0)
        for category, tags in interaction.get("tags", {}).items():
            for tag in tags:
                label = tag["label"]
                conf = tag["confidence"]
                affinity[category][label] += conf * weight

    # Normalize each category so dominant interaction types don't skew everything
    for category, tag_scores in affinity.items():
        total = sum(tag_scores.values())
        if total > 0:
            for label in tag_scores:
                affinity[category][label] /= total

    return affinity


# -------- POST SCORING -------- #

def compute_post_score(post_tags, user_affinity, seen_tag_counts, exploration_factor=0.15):
    """
    Score a post against a user's affinity vector.

    Scoring logic:
    1. For each category, compare post tags to user affinity at the tag level.
       Matching a high-affinity tag scores well; unknown tags get a novelty bonus.
    2. Apply per-category weight.
    3. Apply decay for tags the user has already seen in this feed session.
    4. Add a tunable exploration term for serendipity.

    Args:
        post_tags:          { category: [{ label, confidence }] }
        user_affinity:      output of build_user_affinity()
        seen_tag_counts:    { tag_label: int } — tags already placed in this feed
        exploration_factor: float, scales random exploration noise

    Returns:
        float score
    """
    score = 0.0

    for category, tags in post_tags.items():
        cat_weight = CATEGORY_WEIGHTS.get(category, 0.0)
        if cat_weight == 0 or not tags:
            continue

        cat_affinity = user_affinity.get(category, {})
        cat_score = 0.0

        for tag in tags:
            label = tag["label"]
            conf = tag["confidence"]

            # Affinity match: how much does the user like this tag?
            affinity_score = cat_affinity.get(label, 0.0)

            # Novelty bonus: tags the user has affinity data for are "known";
            # tags with zero affinity history get a small bonus to drive discovery.
            if label not in cat_affinity:
                novelty_bonus = 0.08
            else:
                novelty_bonus = 0.0

            # Tag-level contribution: blend confidence with affinity + novelty
            tag_score = conf * (0.6 + 0.4 * affinity_score) + novelty_bonus

            # Decay if this exact tag has already appeared in the current feed
            times_seen = seen_tag_counts.get(label, 0)
            if times_seen > 0:
                tag_score *= TAG_DECAY_FACTOR ** times_seen

            cat_score += tag_score

        # Normalize by tag count so posts with 10 weak tags don't beat 2 strong ones
        cat_score /= len(tags)
        score += cat_weight * cat_score

    # Exploration noise — slightly higher than original to prevent feed staleness
    score += random.uniform(0, exploration_factor)

    return round(score, 4)


# -------- TAG OVERLAP SIMILARITY -------- #

def tag_similarity(tags_a, tags_b):
    """
    Compute a simple Jaccard-style similarity between two posts' tag sets.
    Used to enforce tag-level diversity within the feed.

    Returns float in [0, 1]. Higher = more similar.
    """
    labels_a = set(t["label"] for tags in tags_a.values() for t in tags)
    labels_b = set(t["label"] for tags in tags_b.values() for t in tags)

    if not labels_a or not labels_b:
        return 0.0

    intersection = labels_a & labels_b
    union = labels_a | labels_b
    return len(intersection) / len(union)


# -------- SERENDIPITY POOL -------- #

def pick_serendipity_posts(posts, fyp_so_far, n):
    """
    Pick posts that are intentionally dissimilar to what's already in the FYP.
    This exposes users to new styles and mediums they haven't engaged with yet.

    Scores each candidate by its MINIMUM similarity to any post already in the FYP —
    picking the ones that are most unlike what the user normally sees.
    """
    candidates = [p for p in posts if p not in fyp_so_far]
    if not candidates:
        return []

    def dissimilarity_score(post):
        if not fyp_so_far:
            return 1.0
        sims = [tag_similarity(post["tags"], fp["tags"]) for fp in fyp_so_far]
        return 1.0 - max(sims)  # Most unlike the most-similar post already in feed

    candidates.sort(key=dissimilarity_score, reverse=True)
    return candidates[:n]


# -------- DIVERSITY-ENFORCED FEED ASSEMBLY -------- #

def assemble_feed(scored_posts, top_n, diversity_threshold=0.45):
    """
    Greedily build the feed by picking high-scoring posts while enforcing
    tag-level diversity. A candidate is skipped if it's too similar to
    any post already selected.

    diversity_threshold: max allowed tag_similarity to any post already in feed.
                         Lower = more diverse feed.
    """
    sorted_posts = sorted(scored_posts, key=lambda x: x["score"], reverse=True)
    feed = []
    seen_tag_counts = defaultdict(int)

    for post in sorted_posts:
        if len(feed) >= top_n:
            break

        # Check similarity against everything already in the feed
        too_similar = any(
            tag_similarity(post["tags"], fp["tags"]) > diversity_threshold
            for fp in feed
        )
        if too_similar:
            continue

        feed.append(post)

        # Update seen tag counts for decay in future scoring passes
        for tags in post["tags"].values():
            for tag in tags:
                seen_tag_counts[tag["label"]] += 1

    return feed, seen_tag_counts


# -------- MAIN FYP GENERATOR -------- #

def generate_fyp(posts, user_affinity=None, top_n=20, exploration_factor=0.15):
    """
    Generate a personalised For You Page for a Loom user.

    Args:
        posts:              list of post dicts, each with a 'tags' key
                            (same shape as /analyze output)
        user_affinity:      output of build_user_affinity(), or None for new users
        top_n:              number of posts to return
        exploration_factor: controls randomness injected into scoring

    Returns:
        list of post dicts with 'score' added, sorted by score descending.
    """
    if user_affinity is None:
        # Cold start: no interaction history — treat all tags as equally novel
        user_affinity = {}

    # How many slots are reserved for serendipity vs personalised
    n_serendipity = max(1, int(top_n * SERENDIPITY_RATIO))
    n_personalised = top_n - n_serendipity

    # First pass: score all posts without decay (seen_tag_counts is empty)
    empty_seen = defaultdict(int)
    for post in posts:
        post["score"] = compute_post_score(
            post["tags"], user_affinity, empty_seen, exploration_factor
        )

    # Build the personalised portion with diversity enforcement
    personalised_feed, seen_tag_counts = assemble_feed(posts, n_personalised)

    # Second pass: re-score remaining posts WITH decay from the personalised feed
    # so serendipity picks are scored in the context of what's already shown
    remaining = [p for p in posts if p not in personalised_feed]
    for post in remaining:
        post["score"] = compute_post_score(
            post["tags"], user_affinity, seen_tag_counts, exploration_factor
        )

    # Pick serendipity posts — high dissimilarity to personalised feed
    serendipity_posts = pick_serendipity_posts(remaining, personalised_feed, n_serendipity)

    # Combine and shuffle serendipity posts into the feed at random positions
    # so they don't all cluster at the end
    final_feed = personalised_feed + serendipity_posts
    for post in serendipity_posts:
        post["is_serendipity"] = True  # Flag so the frontend can optionally mark these

    # Final sort by score — serendipity posts may rank anywhere
    final_feed.sort(key=lambda x: x["score"], reverse=True)

    return final_feed


# -------- EXAMPLE USAGE -------- #

if __name__ == "__main__":
    # Simulate some posts with tags from the /analyze endpoint
    mock_posts = [
        {
            "id": 1,
            "tags": {
                "medium": [{"label": "oil painting", "confidence": 0.31}],
                "subject": [{"label": "portrait", "confidence": 0.29}, {"label": "figure study", "confidence": 0.24}],
                "style": [{"label": "realism", "confidence": 0.27}],
                "mood": [{"label": "melancholic", "confidence": 0.22}],
                "color_palette": [{"label": "muted and desaturated", "confidence": 0.25}],
                "aesthetic_features": [{"label": "heavy texture", "confidence": 0.23}],
            }
        },
        {
            "id": 2,
            "tags": {
                "medium": [{"label": "digital art", "confidence": 0.35}],
                "subject": [{"label": "fantasy scene", "confidence": 0.33}],
                "style": [{"label": "dark fantasy", "confidence": 0.28}, {"label": "painterly", "confidence": 0.21}],
                "mood": [{"label": "mysterious", "confidence": 0.26}],
                "color_palette": [{"label": "cool tones", "confidence": 0.24}],
                "aesthetic_features": [{"label": "cinematic framing", "confidence": 0.22}],
            }
        },
        {
            "id": 3,
            "tags": {
                "medium": [{"label": "watercolor painting", "confidence": 0.28}],
                "subject": [{"label": "botanical illustration", "confidence": 0.31}],
                "style": [{"label": "impressionism", "confidence": 0.24}],
                "mood": [{"label": "peaceful", "confidence": 0.27}],
                "color_palette": [{"label": "pastel colors", "confidence": 0.26}, {"label": "warm tones", "confidence": 0.22}],
                "aesthetic_features": [{"label": "soft gradients", "confidence": 0.21}],
            }
        },
    ]

    # Simulate a user who likes portraits and dark fantasy
    mock_history = [
        {"tags": mock_posts[0]["tags"], "weight": 1.5},  # saved
        {"tags": mock_posts[1]["tags"], "weight": 1.0},  # liked
    ]

    affinity = build_user_affinity(mock_history)
    fyp = generate_fyp(mock_posts, user_affinity=affinity, top_n=3)

    for post in fyp:
        serendipity = post.get("is_serendipity", False)
        print(f"Post {post['id']} | Score: {post['score']} | Serendipity: {serendipity}")