const fs = require('fs');
const json = JSON.parse(fs.readFileSync('src/i18n/locales/pt.json', 'utf8'));

const newGiver = {
  purchasedGifts: json.giver.purchasedGifts,
  purchaseCTA: json.giver.purchaseCTA,
  cart: {
    screenTitle: 'O Teu Carrinho',
    items_one: '{{count}} item',
    items_other: '{{count}} itens',
    empty: {
      title: 'O teu carrinho está vazio',
      message: 'Explora experiências para encontrar o presente perfeito',
      action: 'Continuar a Comprar'
    },
    loadError: 'Não foi possível carregar os itens do carrinho',
    removeDialog: {
      title: 'Remover Item',
      message: 'Tens a certeza que queres remover este item do teu carrinho?',
      confirm: 'Remover',
      cancel: 'Cancelar'
    },
    toast: {
      itemRemoved: 'Item removido do carrinho',
      updateFailed: 'Falha ao atualizar a quantidade. Por favor, tenta de novo.',
      removeFailed: 'Falha ao remover o item. Por favor, tenta de novo.'
    },
    info: {
      maxQuantity: 'Podes adicionar até 10 itens de cada experiência.',
      emptyCheckout: 'O teu carrinho está vazio. Adiciona itens primeiro.'
    },
    total: 'Total',
    proceedToCheckout: 'Continuar para o Checkout',
    keepShopping: 'Continuar a Comprar',
    accessibility: {
      viewDetails: 'Ver detalhes de {{title}}',
      image: 'Imagem de {{title}}',
      removeItem: 'Remover item do carrinho',
      decreaseQuantity: 'Diminuir quantidade',
      increaseQuantity: 'Aumentar quantidade'
    }
  },
  category: {
    screenTitle: 'Experiências para Oferecer',
    screenSubtitle: 'Motiva os teus amigos',
    searchPlaceholder: 'Pesquisar experiências...',
    featured: 'Em Destaque',
    filters: {
      all: 'Todas',
      adventure: 'Aventura',
      wellness: 'Bem-estar',
      creative: 'Criativo'
    },
    empty: {
      noResults: 'Sem resultados para "{{query}}"',
      noResultsMessage: 'Tenta um termo de pesquisa diferente',
      noExperiences: 'Sem Experiências Disponíveis',
      noExperiencesMessage: 'Volta em breve para novas experiências!'
    },
    error: {
      loadFailed: 'Não foi possível carregar as experiências'
    },
    toast: {
      wishlistFailed: 'Falha ao atualizar a lista de desejos. Por favor, tenta de novo.',
      loginRequired: 'Por favor, inicia sessão para usar a lista de desejos.'
    },
    accessibility: {
      featured: 'Em destaque: {{title}}',
      view: 'Ver {{title}}',
      coverImage: 'Imagem de capa de {{title}}',
      addToWishlist: 'Adicionar à lista de desejos',
      removeFromWishlist: 'Remover da lista de desejos',
      search: 'Pesquisar experiências',
      clearSearch: 'Limpar pesquisa',
      dismissEmpower: 'Fechar banner de empoderamento'
    }
  },
  experienceDetails: {
    whatToExpect: 'O que esperar',
    location: 'Localização',
    perPerson: 'por pessoa',
    quantity: 'Quantidade:',
    redirecting: 'A redirecionar...',
    addToCart: 'Adicionar ao Carrinho',
    adding: 'A adicionar...',
    buyNow: 'Comprar Agora',
    howItWorks: 'Como funciona',
    toast: {
      addedToCart: 'Adicionado(s) {{count}} item(ns) ao carrinho!',
      wishlistFailed: 'Falha ao atualizar a lista de desejos. Por favor, tenta de novo.',
      cartFailed: 'Não foi possível adicionar ao carrinho. Por favor, tenta de novo.'
    },
    accessibility: {
      goBack: 'Voltar',
      viewCart: 'Ver carrinho, {{count}} itens',
      addToWishlist: 'Adicionar à lista de desejos',
      removeFromWishlist: 'Remover da lista de desejos',
      viewImage: 'Ver imagem em tamanho completo {{index}} de {{total}}',
      image: 'Imagem de {{title}} {{index}}',
      howItWorks: 'Como funciona',
      decreaseQuantity: 'Diminuir quantidade',
      increaseQuantity: 'Aumentar quantidade',
      addToCart: 'Adicionar ao carrinho',
      buyNow: 'Comprar agora'
    }
  },
  checkout: {
    screenTitle: 'Checkout',
    yourGifts: 'Os Teus Presentes',
    quantity: 'Qtd: {{count}}',
    totalAmount: 'Valor Total',
    total: 'Total',
    paymentDetails: 'Detalhes de Pagamento',
    securityText: 'As tuas informações de pagamento são encriptadas e seguras',
    completePurchase: 'Concluir Compra',
    pay: 'Pagar {{amount}}',
    settingUp: 'A configurar...',
    redirecting: 'A redirecionar...',
    errorInitPayment: 'Não foi possível inicializar o pagamento.',
    retry: 'Tentar de novo',
    goBack: 'Voltar',
    toast: {
      paymentSuccess: 'O teu pagamento foi processado com sucesso!',
      paymentProcessing: 'O teu pagamento está a ser processado. Receberás uma confirmação em breve.',
      paymentActionRequired: 'É necessária uma ação adicional para concluir o teu pagamento.',
      verifyFailed: 'Falha ao verificar o estado do pagamento. Por favor, contacta o suporte.',
      paymentSuccessCheckPurchased: "O teu pagamento foi bem-sucedido! Verifica em 'Presentes Adquiridos'.",
      loadFailed: 'Não foi possível carregar as experiências para o checkout.',
      setupFailed: 'Não foi possível configurar o pagamento. Por favor, tenta de novo.'
    },
    accessibility: {
      goBack: 'Voltar'
    }
  },
  confirmation: {
    hero: {
      togetherTitle: 'Desafio Criado!',
      paymentTitle: 'Pagamento Bem-sucedido',
      togetherSubtitle: 'Partilha o código de convite com o teu parceiro para começarem juntos!',
      empowerSubtitle: 'O teu presente foi enviado para {{name}}!',
      selfGoalSubtitle: 'Preparaste-te para o sucesso. Conclui o teu desafio para desbloqueares!',
      giftSubtitle: 'O teu presente está pronto para partilhar',
      surpriseExperience: 'Experiência Surpresa',
      weWillFind: 'Encontraremos a recompensa perfeita à medida que progrides'
    },
    redirecting: 'A redirecionar...',
    personalMessage: {
      label: 'Mensagem Pessoal',
      subtitle: 'Adiciona uma mensagem especial para tornar este presente extra especial. Aparecerá quando resgatarem o presente.',
      placeholder: 'A tua mensagem aqui...',
      attach: 'Anexar Mensagem',
      sent: 'Mensagem enviada!',
      error: 'Por favor, escreve uma mensagem antes de enviar.',
      saveFailed: 'Falha ao guardar a mensagem. Por favor, tenta de novo.',
      saved: 'A tua mensagem personalizada foi guardada!'
    },
    giftCode: {
      title: 'Código do Presente',
      subtitle: 'Partilha este código para desbloquear a experiência',
      copy: 'Copiar Código',
      copied: 'Copiado!',
      share: 'Partilhar',
      copyFailed: 'Não foi possível copiar para a área de transferência'
    },
    howItWorks: {
      title: 'Como Funciona',
      solo: {
        step1Title: 'Partilha o Código',
        step1Desc: 'Envia o código do presente ao destinatário',
        step2Title: 'Definir Objetivos',
        step2Desc: 'Criam objetivos pessoais para ganhar a experiência',
        step3Title: 'Acompanhar Progresso',
        step3Desc: 'Dicas de IA guiam-nos enquanto trabalham para os objetivos',
        step4Title: 'Desbloquear Recompensa',
        step4Desc: 'A experiência é revelada quando os objetivos são concluídos'
      },
      together: {
        step1Title: 'Partilha o Código',
        step1Desc: 'Envia o convite ao teu parceiro',
        step2Title: 'Eles Juntam-se',
        step2Desc: 'O teu parceiro aceita e define o seu próprio objetivo',
        step3Title: 'Treinar Juntos',
        step3Desc: 'Acompanhem o progresso um do outro e mantenham a motivação',
        step4Title: 'Desbloquear Recompensa',
        step4Desc: 'Ambos concluem o desafio para desbloquear a experiência'
      }
    },
    buttons: {
      startChallenge: 'Iniciar o Teu Desafio',
      backToFeed: 'Voltar ao Feed',
      goToGoals: 'Ir para Os Meus Objetivos',
      backToHome: 'Voltar ao Início'
    },
    share: {
      together: "Junta-te ao meu desafio de fitness no Ernit! Usa o código {{code}} ou regista-te em https://ernit.app/recipient/redeem/{{code}} para começarmos juntos",
      solo: "Olá! Ofereci-te uma experiência Ernit, um pequeno incentivo para os teus objetivos.\n\nRegista-te e resgata o teu presente em https://ernit.app/recipient/redeem/{{code}} para definires os teus objetivos. Quando concluíres os objetivos, verás o que te ofereci\n\nMerece-o. Desbloqueia-o. Desfruta-o",
      title: 'Código do Presente',
      togetherTitle: 'Convite para Desafio'
    },
    toast: {
      loadFailed: 'Não foi possível carregar os detalhes da experiência.',
      messageSaved: 'A tua mensagem personalizada foi guardada!',
      messageFailed: 'Falha ao guardar a mensagem. Por favor, tenta de novo.',
      copyFailed: 'Não foi possível copiar para a área de transferência',
      shareFailed: 'Não foi possível abrir o diálogo de partilha. Tenta de novo ou copia o código manualmente.'
    },
    accessibility: {
      image: 'Imagem da experiência {{title}}',
      personalMessage: 'Mensagem pessoal',
      copyCode: 'Copiar código do presente',
      shareCode: 'Partilhar código do presente'
    }
  },
  confirmationMultiple: {
    hero: {
      title: 'Pagamento Bem-sucedido!',
      subtitle_one: '{{count}} presente pronto para partilhar',
      subtitle_other: '{{count}} presentes prontos para partilhar'
    },
    personalMessage: {
      label: 'Mensagem Pessoal',
      subtitle: 'Adiciona uma mensagem especial para tornar este presente extra especial.',
      placeholder: 'A tua mensagem aqui...',
      attach: 'Anexar Mensagem',
      sent: 'Mensagem enviada!'
    },
    giftCode: {
      label: 'Código do Presente',
      copy: 'Copiar',
      share: 'Partilhar'
    },
    howItWorks: {
      title: 'Como Funciona',
      step1Title: 'Partilha o Código',
      step1Desc: 'Envia o código do presente ao destinatário',
      step2Title: 'Definir Objetivos',
      step2Desc: 'Criam objetivos pessoais para ganhar a experiência',
      step3Title: 'Acompanhar Progresso',
      step3Desc: 'Dicas de IA guiam-nos enquanto trabalham para os objetivos',
      step4Title: 'Desbloquear Recompensa',
      step4Desc: 'A experiência é revelada quando os objetivos são concluídos'
    },
    buttons: {
      backToHome: 'Voltar ao Início'
    },
    loadError: {
      title: 'Não foi possível carregar os detalhes da experiência',
      message: 'Por favor, verifica a tua ligação e tenta de novo.',
      retry: 'Tentar de novo'
    },
    toast: {
      loadFailed: 'Não foi possível carregar os detalhes da experiência.',
      messageSaved: 'A tua mensagem personalizada foi guardada!',
      messageFailed: 'Falha ao guardar a mensagem. Por favor, tenta de novo.',
      copyFailed: 'Não foi possível copiar para a área de transferência',
      codeUnavailable: 'O código do presente ainda não está disponível.',
      shareFailed: 'Não foi possível abrir o diálogo de partilha.'
    },
    accessibility: {
      image: 'Imagem da experiência {{title}}',
      personalMessage: 'Mensagem pessoal para {{title}}',
      copyCode: 'Copiar código do presente para {{title}}',
      shareCode: 'Partilhar código do presente para {{title}}',
      retry: 'Tentar carregar experiências de novo',
      backToHome: 'Voltar ao início'
    }
  },
  deferred: {
    screenTitle: 'Protege o Teu Presente',
    infoCard: {
      title: 'Sem cobrança até ao sucesso',
      subtitle: "Guarda o teu cartão agora. Só cobraremos quando o destinatário concluir o objetivo. Podes remover em qualquer altura em Presentes Adquiridos."
    },
    cardDetails: 'Detalhes do Cartão',
    securityText: 'As tuas informações de pagamento são encriptadas e seguras',
    saveCard: 'Guardar Cartão & Continuar',
    settingUp: 'A configurar...',
    skipForNow: 'Saltar por agora',
    toast: {
      skipInfo: 'Podes adicionar os detalhes de pagamento mais tarde em Presentes Adquiridos.',
      cardValidationFailed: 'Validação do cartão falhou. Por favor, verifica os detalhes do cartão e tenta de novo.',
      cardSaveFailed: 'Não foi possível guardar o teu cartão. Por favor, verifica os detalhes e tenta de novo.',
      verificationIncomplete: 'Verificação do cartão incompleta. Por favor, tenta de novo.',
      genericError: 'Algo correu mal. Por favor, tenta de novo.',
      setupFailed: 'Não foi possível configurar o formulário de cartão. Por favor, tenta de novo.'
    },
    accessibility: {
      goBack: 'Voltar',
      skipCard: 'Saltar configuração do cartão por agora'
    }
  },
  mystery: {
    screenTitle: 'Oferecer um Desafio',
    stepTitle: 'Como é revelada a recompensa?',
    stepSubtitle: 'Devem saber para o que estão a trabalhar?',
    redirecting: 'A redirecionar...',
    options: {
      revealedLabel: 'Revelado',
      revealedTagline: 'Sabem a recompensa desde o primeiro dia. Motivação total para a ganhar.',
      secretLabel: 'Secreto',
      secretTagline: 'A recompensa fica escondida. O Ernit dá dicas em cada sessão.',
      secretBadge: 'Fator surpresa'
    },
    continue: 'Continuar',
    accessibility: {
      goBack: 'Voltar',
      selectReveal: 'Selecionar modo de revelação {{label}}'
    }
  }
};

json.giver = newGiver;
fs.writeFileSync('src/i18n/locales/pt.json', JSON.stringify(json, null, 2));
console.log('pt.json updated successfully');
