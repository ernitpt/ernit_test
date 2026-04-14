const fs = require('fs');
const json = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8'));

const newGiver = {
  purchasedGifts: json.giver.purchasedGifts,
  purchaseCTA: json.giver.purchaseCTA,
  cart: {
    screenTitle: 'Your Cart',
    items_one: '{{count}} item',
    items_other: '{{count}} items',
    empty: {
      title: 'Your cart is empty',
      message: 'Browse experiences to find the perfect gift',
      action: 'Keep Shopping'
    },
    loadError: 'Could not load cart items',
    removeDialog: {
      title: 'Remove Item',
      message: 'Are you sure you want to remove this item from your cart?',
      confirm: 'Remove',
      cancel: 'Cancel'
    },
    toast: {
      itemRemoved: 'Item removed from cart',
      updateFailed: 'Failed to update quantity. Please try again.',
      removeFailed: 'Failed to remove item. Please try again.'
    },
    info: {
      maxQuantity: 'You can add up to 10 items of each experience.',
      emptyCheckout: 'Your cart is empty. Add items to cart first.'
    },
    total: 'Total',
    proceedToCheckout: 'Proceed to Checkout',
    keepShopping: 'Keep Shopping',
    accessibility: {
      viewDetails: 'View {{title}} details',
      image: '{{title}} image',
      removeItem: 'Remove item from cart',
      decreaseQuantity: 'Decrease quantity',
      increaseQuantity: 'Increase quantity'
    }
  },
  category: {
    screenTitle: 'Gift Experiences',
    screenSubtitle: 'Empower your friends',
    searchPlaceholder: 'Search experiences...',
    featured: 'Featured',
    filters: {
      all: 'All',
      adventure: 'Adventure',
      wellness: 'Wellness',
      creative: 'Creative'
    },
    empty: {
      noResults: 'No results for "{{query}}"',
      noResultsMessage: 'Try a different search term',
      noExperiences: 'No Experiences Available',
      noExperiencesMessage: 'Check back soon for new experiences!'
    },
    error: {
      loadFailed: 'Could not load experiences'
    },
    toast: {
      wishlistFailed: 'Failed to update wishlist. Please try again.',
      loginRequired: 'Please log in to use wishlist.'
    },
    accessibility: {
      featured: 'Featured: {{title}}',
      view: 'View {{title}}',
      coverImage: '{{title}} cover image',
      addToWishlist: 'Add to wishlist',
      removeFromWishlist: 'Remove from wishlist',
      search: 'Search experiences',
      clearSearch: 'Clear search',
      dismissEmpower: 'Dismiss empower banner'
    }
  },
  experienceDetails: {
    whatToExpect: 'What to expect',
    location: 'Location',
    perPerson: 'per person',
    quantity: 'Quantity:',
    redirecting: 'Redirecting...',
    addToCart: 'Add to Cart',
    adding: 'Adding...',
    buyNow: 'Buy Now',
    howItWorks: 'How it works',
    toast: {
      addedToCart: 'Added {{count}} item(s) to cart!',
      wishlistFailed: 'Failed to update wishlist. Please try again.',
      cartFailed: 'Could not add item to cart. Please try again.'
    },
    accessibility: {
      goBack: 'Go back',
      viewCart: 'View cart, {{count}} items',
      addToWishlist: 'Add to wishlist',
      removeFromWishlist: 'Remove from wishlist',
      viewImage: 'View full size image {{index}} of {{total}}',
      image: '{{title}} image {{index}}',
      howItWorks: 'How it works',
      decreaseQuantity: 'Decrease quantity',
      increaseQuantity: 'Increase quantity',
      addToCart: 'Add to cart',
      buyNow: 'Buy now'
    }
  },
  checkout: {
    screenTitle: 'Checkout',
    yourGifts: 'Your Gifts',
    quantity: 'Qty: {{count}}',
    totalAmount: 'Total Amount',
    total: 'Total',
    paymentDetails: 'Payment Details',
    securityText: 'Your payment information is encrypted and secure',
    completePurchase: 'Complete Purchase',
    pay: 'Pay {{amount}}',
    settingUp: 'Setting up...',
    redirecting: 'Redirecting...',
    errorInitPayment: 'Could not initialize payment.',
    retry: 'Retry',
    goBack: 'Go Back',
    toast: {
      paymentSuccess: 'Your payment was processed successfully!',
      paymentProcessing: 'Your payment is being processed. You will receive a confirmation shortly.',
      paymentActionRequired: 'Additional action is required to complete your payment.',
      verifyFailed: 'Failed to verify payment status. Please contact support.',
      paymentSuccessCheckPurchased: "Your payment was successful! Check 'Purchased Gifts' to view your gifts.",
      loadFailed: 'Could not load experiences for checkout.',
      setupFailed: 'Could not set up payment. Please try again.'
    },
    accessibility: {
      goBack: 'Go back'
    }
  },
  confirmation: {
    hero: {
      togetherTitle: 'Challenge Created!',
      paymentTitle: 'Payment Successful',
      togetherSubtitle: 'Share the invite code with your partner to get started together!',
      empowerSubtitle: 'Your gift has been sent to {{name}}!',
      selfGoalSubtitle: 'You just set yourself for success. Now complete your challenge to unlock it!',
      giftSubtitle: 'Your thoughtful gift is ready to share',
      surpriseExperience: 'Surprise Experience',
      weWillFind: "We'll find the perfect reward as you progress"
    },
    redirecting: 'Redirecting...',
    personalMessage: {
      label: 'Personal Message',
      subtitle: 'Add a heartfelt message to make this gift extra special. It will show up when they redeem the gift.',
      placeholder: 'Your message here...',
      attach: 'Attach Message',
      sent: 'Message sent!',
      error: 'Please enter a message before sending.',
      saveFailed: 'Failed to save message. Please try again.',
      saved: 'Your personalized message has been saved!'
    },
    giftCode: {
      title: 'Gift Code',
      subtitle: 'Share this code to unlock the experience',
      copy: 'Copy Code',
      copied: 'Copied!',
      share: 'Share',
      copyFailed: 'Could not copy to clipboard'
    },
    howItWorks: {
      title: 'How It Works',
      solo: {
        step1Title: 'Share the Code',
        step1Desc: 'Send the gift code to your recipient',
        step2Title: 'Set Goals',
        step2Desc: 'They create personal goals to earn the experience',
        step3Title: 'Track Progress',
        step3Desc: 'AI hints guide them as they work toward their goals',
        step4Title: 'Unlock Reward',
        step4Desc: 'Experience is revealed when goals are complete'
      },
      together: {
        step1Title: 'Share the Code',
        step1Desc: 'Send the invite to your partner',
        step2Title: 'They Join',
        step2Desc: 'Your partner accepts and sets their own goal',
        step3Title: 'Train Together',
        step3Desc: "Track each other's progress and stay motivated",
        step4Title: 'Unlock Reward',
        step4Desc: 'Both complete the challenge to unlock the experience'
      }
    },
    buttons: {
      startChallenge: 'Start Your Challenge',
      backToFeed: 'Back to Feed',
      goToGoals: 'Go to My Goals',
      backToHome: 'Back to Home'
    },
    share: {
      together: "Join my fitness challenge on Ernit! Use code {{code}} or sign up at https://ernit.app/recipient/redeem/{{code}} to get started together",
      solo: "Hey! Got you an Ernit experience, a little boost for your goals.\n\nSign up and redeem your gift at https://ernit.app/recipient/redeem/{{code}} to set up your goals. Once you complete your goals, you'll see what I got you\n\nEarn it. Unlock it. Enjoy it",
      title: 'Gift Code',
      togetherTitle: 'Challenge Invite'
    },
    toast: {
      loadFailed: 'Could not load experience details.',
      messageSaved: 'Your personalized message has been saved!',
      messageFailed: 'Failed to save message. Please try again.',
      copyFailed: 'Could not copy to clipboard',
      shareFailed: 'Could not open share dialog. Try again or copy the code manually.'
    },
    accessibility: {
      image: '{{title}} experience image',
      personalMessage: 'Personal message',
      copyCode: 'Copy gift code',
      shareCode: 'Share gift code'
    }
  },
  confirmationMultiple: {
    hero: {
      title: 'Payment Successful!',
      subtitle_one: '{{count}} thoughtful gift ready to share',
      subtitle_other: '{{count}} thoughtful gifts ready to share'
    },
    personalMessage: {
      label: 'Personal Message',
      subtitle: 'Add a heartfelt message to make this gift extra special. It will show up when they redeem the gift.',
      placeholder: 'Your message here...',
      attach: 'Attach Message',
      sent: 'Message sent!'
    },
    giftCode: {
      label: 'Gift Code',
      copy: 'Copy',
      share: 'Share'
    },
    howItWorks: {
      title: 'How It Works',
      step1Title: 'Share the Code',
      step1Desc: 'Send the gift code to your recipient',
      step2Title: 'Set Goals',
      step2Desc: 'They create personal goals to earn the experience',
      step3Title: 'Track Progress',
      step3Desc: 'AI hints guide them as they work toward their goals',
      step4Title: 'Unlock Reward',
      step4Desc: 'Experience is revealed when goals are complete'
    },
    buttons: {
      backToHome: 'Back to Home'
    },
    loadError: {
      title: 'Could not load experience details',
      message: 'Please check your connection and try again.',
      retry: 'Retry'
    },
    toast: {
      loadFailed: 'Could not load experience details.',
      messageSaved: 'Your personalized message has been saved!',
      messageFailed: 'Failed to save message. Please try again.',
      copyFailed: 'Could not copy to clipboard',
      codeUnavailable: 'Gift code is not available yet.',
      shareFailed: 'Could not open share dialog. Try again or copy the code manually.'
    },
    accessibility: {
      image: '{{title}} experience image',
      personalMessage: 'Personal message for {{title}}',
      copyCode: 'Copy gift code for {{title}}',
      shareCode: 'Share gift code for {{title}}',
      retry: 'Retry loading experiences',
      backToHome: 'Back to home'
    }
  },
  deferred: {
    screenTitle: 'Secure Your Gift',
    infoCard: {
      title: 'Zero charge until they succeed',
      subtitle: "Save your card now. We'll only charge you once your recipient completes their goal. You can remove it any time from Purchased Gifts."
    },
    cardDetails: 'Card Details',
    securityText: 'Your payment information is encrypted and secure',
    saveCard: 'Save Card & Continue',
    settingUp: 'Setting up...',
    skipForNow: 'Skip for now',
    toast: {
      skipInfo: 'You can add payment details later from Purchased Gifts.',
      cardValidationFailed: 'Card validation failed. Please check your card details and try again.',
      cardSaveFailed: 'Could not save your card. Please verify your details and try again.',
      verificationIncomplete: 'Card verification incomplete. Please try again.',
      genericError: 'Something went wrong. Please try again.',
      setupFailed: 'Could not set up card form. Please try again.'
    },
    accessibility: {
      goBack: 'Go back',
      skipCard: 'Skip card setup for now'
    }
  },
  mystery: {
    screenTitle: 'Gift a Challenge',
    stepTitle: 'How is the reward revealed?',
    stepSubtitle: "Should they know what they're working towards?",
    redirecting: 'Redirecting...',
    options: {
      revealedLabel: 'Revealed',
      revealedTagline: 'They know the reward from day one. Full motivation to earn it.',
      secretLabel: 'Secret',
      secretTagline: 'The reward stays hidden. Ernit drops hints every session.',
      secretBadge: 'Surprise factor'
    },
    continue: 'Continue',
    accessibility: {
      goBack: 'Go back',
      selectReveal: 'Select {{label}} reveal mode'
    }
  }
};

json.giver = newGiver;
fs.writeFileSync('src/i18n/locales/en.json', JSON.stringify(json, null, 2));
console.log('en.json updated successfully');
