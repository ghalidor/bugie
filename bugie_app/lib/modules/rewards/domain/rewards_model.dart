/// Modelos del módulo de puntos (Rewards, puerto 5006).
/// Espejo exacto de los DTOs de Bugie.Rewards.Api.

class RewardsPointsProfile {
  final int       totalPoints;
  final int       availablePoints;
  final int       redeemedPoints;
  final String    currentLevel;
  final String    currentLevelName;
  final double    discountPercentage;
  final String?   nextLevel;
  final String?   nextLevelName;
  final int       pointsToNextLevel;
  final int       progressPercentage;
  final DateTime? pointsExpiryDate;
  final DateTime? lastActivityDate;

  RewardsPointsProfile({
    required this.totalPoints,
    required this.availablePoints,
    required this.redeemedPoints,
    required this.currentLevel,
    required this.currentLevelName,
    required this.discountPercentage,
    required this.pointsToNextLevel,
    required this.progressPercentage,
    this.nextLevel,
    this.nextLevelName,
    this.pointsExpiryDate,
    this.lastActivityDate,
  });

  factory RewardsPointsProfile.fromJson(Map<String, dynamic> j) =>
      RewardsPointsProfile(
        totalPoints:        (j['totalPoints']     as num?)?.toInt() ?? 0,
        availablePoints:    (j['availablePoints'] as num?)?.toInt() ?? 0,
        redeemedPoints:     (j['redeemedPoints']  as num?)?.toInt() ?? 0,
        currentLevel:       (j['currentLevel']     ?? 'bronze').toString(),
        currentLevelName:   (j['currentLevelName'] ?? 'Bronce').toString(),
        discountPercentage: (j['discountPercentage'] as num?)?.toDouble() ?? 0,
        nextLevel:          j['nextLevel']?.toString(),
        nextLevelName:      j['nextLevelName']?.toString(),
        pointsToNextLevel:  (j['pointsToNextLevel']  as num?)?.toInt() ?? 0,
        progressPercentage: (j['progressPercentage'] as num?)?.toInt() ?? 0,
        pointsExpiryDate:   _date(j['pointsExpiryDate']),
        lastActivityDate:   _date(j['lastActivityDate']),
      );

  /// Días que faltan para que venza el saldo. null si no hay fecha.
  int? get daysUntilExpiry {
    final d = pointsExpiryDate;
    if (d == null) return null;
    return d.difference(DateTime.now()).inDays;
  }
}

/// Movimiento del libro de puntos.
class RewardsTransaction {
  final String   id;
  final String   type;        // earn | redeem | expire | bonus
  final int      points;
  final String   sourceEvent;
  final int      balanceAfter;
  final String?  notes;
  final DateTime createdAt;

  RewardsTransaction({
    required this.id,
    required this.type,
    required this.points,
    required this.sourceEvent,
    required this.balanceAfter,
    required this.createdAt,
    this.notes,
  });

  factory RewardsTransaction.fromJson(Map<String, dynamic> j) =>
      RewardsTransaction(
        id:           j['id'].toString(),
        type:         (j['type'] ?? 'earn').toString(),
        points:       (j['points']       as num?)?.toInt() ?? 0,
        sourceEvent:  (j['sourceEvent'] ?? '').toString(),
        balanceAfter: (j['balanceAfter'] as num?)?.toInt() ?? 0,
        notes:        j['notes']?.toString(),
        createdAt:    _date(j['createdAt']) ?? DateTime.now(),
      );

  /// true si el movimiento suma puntos.
  bool get isPositive => type == 'earn' || type == 'bonus';
}

class RewardLevel {
  final String name;
  final String displayName;
  final int    sortOrder;
  final int    minPoints;
  final double discountPercentage;
  final int    monthlyFreeTrips;
  final int    monthlyRaffleTickets;

  RewardLevel({
    required this.name,
    required this.displayName,
    required this.sortOrder,
    required this.minPoints,
    required this.discountPercentage,
    required this.monthlyFreeTrips,
    required this.monthlyRaffleTickets,
  });

  factory RewardLevel.fromJson(Map<String, dynamic> j) => RewardLevel(
        name:                 (j['name'] ?? '').toString(),
        displayName:          (j['displayName'] ?? '').toString(),
        sortOrder:            (j['sortOrder'] as num?)?.toInt() ?? 0,
        minPoints:            (j['minPoints'] as num?)?.toInt() ?? 0,
        discountPercentage:   (j['discountPercentage']   as num?)?.toDouble() ?? 0,
        monthlyFreeTrips:     (j['monthlyFreeTrips']     as num?)?.toInt() ?? 0,
        monthlyRaffleTickets: (j['monthlyRaffleTickets'] as num?)?.toInt() ?? 0,
      );
}

/// Item del catálogo de canje.
class RewardCatalogItem {
  final String  id;
  final String  name;
  final String? description;
  final int     pointsCost;
  final String  rewardType;
  final double? amountSoles;
  final int?    quantity;
  final double? percentage;
  final int?    stock;
  final int     validityDays;
  final bool    canAfford;
  final int     pointsMissing;
  final String? blockedReason;

  RewardCatalogItem({
    required this.id,
    required this.name,
    required this.pointsCost,
    required this.rewardType,
    required this.validityDays,
    required this.canAfford,
    required this.pointsMissing,
    this.description,
    this.amountSoles,
    this.quantity,
    this.percentage,
    this.stock,
    this.blockedReason,
  });

  factory RewardCatalogItem.fromJson(Map<String, dynamic> j) =>
      RewardCatalogItem(
        id:            j['id'].toString(),
        name:          (j['name'] ?? '').toString(),
        description:   j['description']?.toString(),
        pointsCost:    (j['pointsCost']   as num?)?.toInt() ?? 0,
        rewardType:    (j['rewardType'] ?? '').toString(),
        amountSoles:   (j['amountSoles']  as num?)?.toDouble(),
        quantity:      (j['quantity']     as num?)?.toInt(),
        percentage:    (j['percentage']   as num?)?.toDouble(),
        stock:         (j['stock']        as num?)?.toInt(),
        validityDays:  (j['validityDays'] as num?)?.toInt() ?? 30,
        canAfford:     j['canAfford'] == true,
        pointsMissing: (j['pointsMissing'] as num?)?.toInt() ?? 0,
        blockedReason: j['blockedReason']?.toString(),
      );
}

/// Cupón generado al canjear.
class RewardRedemption {
  final String    id;
  final String    code;
  final String    itemName;
  final int       pointsSpent;
  final String    rewardType;
  final double?   amountSoles;
  final int?      quantity;
  final double?   percentage;
  final String    status;      // active | used | expired | cancelled
  final DateTime  expiresAt;
  final DateTime? usedAt;
  final String?   usedNote;
  final DateTime  createdAt;

  RewardRedemption({
    required this.id,
    required this.code,
    required this.itemName,
    required this.pointsSpent,
    required this.rewardType,
    required this.status,
    required this.expiresAt,
    required this.createdAt,
    this.amountSoles,
    this.quantity,
    this.percentage,
    this.usedAt,
    this.usedNote,
  });

  factory RewardRedemption.fromJson(Map<String, dynamic> j) =>
      RewardRedemption(
        id:          j['id'].toString(),
        code:        (j['code'] ?? '').toString(),
        itemName:    (j['itemName'] ?? '').toString(),
        pointsSpent: (j['pointsSpent'] as num?)?.toInt() ?? 0,
        rewardType:  (j['rewardType'] ?? '').toString(),
        amountSoles: (j['amountSoles'] as num?)?.toDouble(),
        quantity:    (j['quantity']    as num?)?.toInt(),
        percentage:  (j['percentage']  as num?)?.toDouble(),
        status:      (j['status'] ?? 'active').toString(),
        expiresAt:   _date(j['expiresAt']) ?? DateTime.now(),
        usedAt:      _date(j['usedAt']),
        usedNote:    j['usedNote']?.toString(),
        createdAt:   _date(j['createdAt']) ?? DateTime.now(),
      );

  /// true si el canje se cobra o se recoge donde el admin con su código
  /// (bono en soles, producto o beneficio de socio). Los descuentos, viajes
  /// gratis y tickets se aplican solos dentro de la app.
  /// true si es un cupón de beneficio de nivel (no costó puntos).
  bool get isLevelBenefit => pointsSpent == 0;

  bool get isCollectible =>
      rewardType == 'wallet_bonus' ||
      rewardType == 'physical' ||
      rewardType == 'partner_benefit';
}

/// Resultado del canje: el cupón más el saldo que quedó.
class RedeemResult {
  final RewardRedemption redemption;
  final int              availablePointsAfter;
  final String           currentLevel;

  RedeemResult({
    required this.redemption,
    required this.availablePointsAfter,
    required this.currentLevel,
  });

  factory RedeemResult.fromJson(Map<String, dynamic> j) => RedeemResult(
        redemption: RewardRedemption.fromJson(
            (j['redemption'] as Map).cast<String, dynamic>()),
        availablePointsAfter: (j['availablePointsAfter'] as num?)?.toInt() ?? 0,
        currentLevel: (j['currentLevel'] ?? 'bronze').toString(),
      );
}

/// Promoción vigente, ya redactada por el backend.
class ActivePromotion {
  final String    id;
  final String    name;
  final String?   description;
  /// Qué ganas: «2x puntos» o «+50 puntos».
  final String    reward;
  /// Cuándo aplica: «Lun a Vie, de 12:00 a 14:00».
  final String    when;
  /// true si aplica justo ahora.
  final bool      activeNow;
  final DateTime? endDate;

  ActivePromotion({
    required this.id,
    required this.name,
    required this.reward,
    required this.when,
    required this.activeNow,
    this.description,
    this.endDate,
  });

  factory ActivePromotion.fromJson(Map<String, dynamic> j) => ActivePromotion(
        id:          j['id'].toString(),
        name:        (j['name'] ?? '').toString(),
        description: j['description']?.toString(),
        reward:      (j['reward'] ?? '').toString(),
        when:        (j['when'] ?? '').toString(),
        activeNow:   j['activeNow'] == true,
        endDate:     _date(j['endDate']),
      );
}

/// Sorteo visto por el usuario.
class UserRaffle {
  final String    id;
  final String    name;
  final String    raffleType;      // weekly | monthly | special
  final String    prizeDescription;
  final double?   prizeValue;
  final DateTime  drawDate;
  final String    status;          // open | closed | drawn | cancelled
  final int       myTickets;
  final bool      eligible;
  final String?   notEligibleReason;
  final bool      iWon;
  final int?      myPrizeRank;
  final String?   myTicketNumber;
  /// Si ganó: código para cobrar el premio donde el admin (PZ-XXXXXX).
  final String?   myPrizeCode;
  /// Si ganó: el premio ya se le entregó o pagó.
  final bool      myPrizeDelivered;
  /// Cupones de ticket (canjeados en el catálogo) que puedo usar aquí.
  final int       ticketCouponsAvailable;
  /// true si el sorteo está abierto, cumplo requisitos y tengo cupón de ticket.
  final bool      canUseTicketCoupon;
  /// Cupón de ticket que se usaría (el que vence primero).
  final String?   nextTicketCouponId;

  UserRaffle({
    required this.id,
    required this.name,
    required this.raffleType,
    required this.prizeDescription,
    required this.drawDate,
    required this.status,
    required this.myTickets,
    required this.eligible,
    required this.iWon,
    this.prizeValue,
    this.notEligibleReason,
    this.myPrizeRank,
    this.myTicketNumber,
    this.myPrizeCode,
    this.myPrizeDelivered = false,
    this.ticketCouponsAvailable = 0,
    this.canUseTicketCoupon = false,
    this.nextTicketCouponId,
  });

  factory UserRaffle.fromJson(Map<String, dynamic> j) => UserRaffle(
        id:                j['id'].toString(),
        name:              (j['name'] ?? '').toString(),
        raffleType:        (j['raffleType'] ?? 'monthly').toString(),
        prizeDescription:  (j['prizeDescription'] ?? '').toString(),
        prizeValue:        (j['prizeValue'] as num?)?.toDouble(),
        drawDate:          _date(j['drawDate']) ?? DateTime.now(),
        status:            (j['status'] ?? 'open').toString(),
        myTickets:         (j['myTickets'] as num?)?.toInt() ?? 0,
        eligible:          j['eligible'] == true,
        notEligibleReason: j['notEligibleReason']?.toString(),
        iWon:              j['iWon'] == true,
        myPrizeRank:       (j['myPrizeRank'] as num?)?.toInt(),
        myTicketNumber:    j['myTicketNumber']?.toString(),
        myPrizeCode:       j['myPrizeCode']?.toString(),
        myPrizeDelivered:  j['myPrizeDelivered'] == true,
        ticketCouponsAvailable: (j['ticketCouponsAvailable'] as num?)?.toInt() ?? 0,
        canUseTicketCoupon:     j['canUseTicketCoupon'] == true,
        nextTicketCouponId:     j['nextTicketCouponId']?.toString(),
      );

  bool get isDrawn => status == 'drawn';

  /// Cuánto falta para el sorteo, en texto.
  String get countdown {
    final d = drawDate.difference(DateTime.now()).inDays;
    if (isDrawn) return 'Ya se sorteó';
    if (d < 0)   return 'Pendiente de sortear';
    if (d == 0)  return 'Se sortea hoy';
    if (d == 1)  return 'Se sortea mañana';
    return 'Faltan $d días';
  }
}

/// Resultado de usar un cupón de ticket en un sorteo.
class TicketCouponResult {
  final String       raffleId;
  final String       raffleName;
  final int          ticketsAdded;
  final List<String> ticketNumbers;
  final int          myTickets;
  final int          ticketCouponsLeft;

  TicketCouponResult({
    required this.raffleId,
    required this.raffleName,
    required this.ticketsAdded,
    required this.ticketNumbers,
    required this.myTickets,
    required this.ticketCouponsLeft,
  });

  factory TicketCouponResult.fromJson(Map<String, dynamic> j) =>
      TicketCouponResult(
        raffleId:          (j['raffleId'] ?? '').toString(),
        raffleName:        (j['raffleName'] ?? '').toString(),
        ticketsAdded:      (j['ticketsAdded'] as num?)?.toInt() ?? 0,
        ticketNumbers:     ((j['ticketNumbers'] as List?) ?? [])
            .map((e) => e.toString())
            .toList(),
        myTickets:         (j['myTickets'] as num?)?.toInt() ?? 0,
        ticketCouponsLeft: (j['ticketCouponsLeft'] as num?)?.toInt() ?? 0,
      );
}

/// Cupo del mes de un beneficio de nivel (cupones o viajes gratis).
class BenefitQuota {
  final int     total;
  final int     used;
  final int     available;
  /// Solo viajes gratis: tope en soles de cada viaje.
  final double? maxAmount;

  BenefitQuota({
    required this.total,
    required this.used,
    required this.available,
    this.maxAmount,
  });

  factory BenefitQuota.fromJson(Map<String, dynamic>? j) => BenefitQuota(
        total:     (j?['total']     as num?)?.toInt() ?? 0,
        used:      (j?['used']      as num?)?.toInt() ?? 0,
        available: (j?['available'] as num?)?.toInt() ?? 0,
        maxAmount: (j?['maxAmount'] as num?)?.toDouble(),
      );
}

/// Beneficios de mi nivel en el mes (solo pasajero).
class LevelBenefits {
  final bool      eligible;
  final String?   notEligibleReason;
  final String    level;
  final String    levelName;
  final double    discountPercentage;
  final BenefitQuota discountCoupons;
  final BenefitQuota freeTrips;
  final String    period;
  /// Fin del mes (hora de Perú): ahí vencen los cupones reclamados.
  final DateTime? periodEndsAt;
  final bool      couponsApplyToFare;
  final bool      canClaim;

  LevelBenefits({
    required this.eligible,
    required this.level,
    required this.levelName,
    required this.discountPercentage,
    required this.discountCoupons,
    required this.freeTrips,
    required this.period,
    required this.couponsApplyToFare,
    required this.canClaim,
    this.notEligibleReason,
    this.periodEndsAt,
  });

  factory LevelBenefits.fromJson(Map<String, dynamic> j) => LevelBenefits(
        eligible:           j['eligible'] == true,
        notEligibleReason:  j['notEligibleReason']?.toString(),
        level:              (j['level'] ?? 'bronze').toString(),
        levelName:          (j['levelName'] ?? '').toString(),
        discountPercentage: (j['discountPercentage'] as num?)?.toDouble() ?? 0,
        discountCoupons:    BenefitQuota.fromJson(
            (j['discountCoupons'] as Map?)?.cast<String, dynamic>()),
        freeTrips:          BenefitQuota.fromJson(
            (j['freeTrips'] as Map?)?.cast<String, dynamic>()),
        period:             (j['period'] ?? '').toString(),
        periodEndsAt:       _date(j['periodEndsAt']),
        couponsApplyToFare: j['couponsApplyToFare'] == true,
        canClaim:           j['canClaim'] == true,
      );

  /// true si hay algo que mostrar: algún cupo con total mayor a 0.
  bool get hasAny => discountCoupons.total > 0 || freeTrips.total > 0;
}

/// Resultado de reclamar un beneficio: el cupón creado y cómo queda el mes.
class LevelClaimResult {
  final RewardRedemption coupon;
  final LevelBenefits    benefits;

  LevelClaimResult({required this.coupon, required this.benefits});

  factory LevelClaimResult.fromJson(Map<String, dynamic> j) => LevelClaimResult(
        coupon:   RewardRedemption.fromJson(
            (j['coupon'] as Map).cast<String, dynamic>()),
        benefits: LevelBenefits.fromJson(
            ((j['benefits'] as Map?) ?? {}).cast<String, dynamic>()),
      );
}

/// Una persona que invité.
class ReferredPerson {
  final String   userType;
  final String   status;          // pending | qualified
  final int      tripsCompleted;
  final int      pointsEarned;
  final DateTime joinedAt;

  ReferredPerson({
    required this.userType,
    required this.status,
    required this.tripsCompleted,
    required this.pointsEarned,
    required this.joinedAt,
  });

  factory ReferredPerson.fromJson(Map<String, dynamic> j) => ReferredPerson(
        userType:       (j['userType'] ?? 'passenger').toString(),
        status:         (j['status'] ?? 'pending').toString(),
        tripsCompleted: (j['tripsCompleted'] as num?)?.toInt() ?? 0,
        pointsEarned:   (j['pointsEarned']   as num?)?.toInt() ?? 0,
        joinedAt:       _date(j['joinedAt']) ?? DateTime.now(),
      );

  bool get isQualified => status == 'qualified';
}

/// Mi código de invitación y cómo me va.
class MyReferral {
  final String  code;
  final bool    enabled;
  final int     totalInvited;
  final int     qualified;
  final int     pointsEarned;
  final int     pointsPerPassenger;
  final int     pointsPerDriver;
  final int     qualifyTrips;
  final int     qualifyPoints;
  final List<ReferredPerson> people;

  MyReferral({
    required this.code,
    required this.enabled,
    required this.totalInvited,
    required this.qualified,
    required this.pointsEarned,
    required this.pointsPerPassenger,
    required this.pointsPerDriver,
    required this.qualifyTrips,
    required this.qualifyPoints,
    required this.people,
  });

  factory MyReferral.fromJson(Map<String, dynamic> j) => MyReferral(
        code:               (j['code'] ?? '').toString(),
        enabled:            j['enabled'] != false,
        totalInvited:       (j['totalInvited']       as num?)?.toInt() ?? 0,
        qualified:          (j['qualified']          as num?)?.toInt() ?? 0,
        pointsEarned:       (j['pointsEarned']       as num?)?.toInt() ?? 0,
        pointsPerPassenger: (j['pointsPerPassenger'] as num?)?.toInt() ?? 0,
        pointsPerDriver:    (j['pointsPerDriver']    as num?)?.toInt() ?? 0,
        qualifyTrips:       (j['qualifyTrips']       as num?)?.toInt() ?? 0,
        qualifyPoints:      (j['qualifyPoints']      as num?)?.toInt() ?? 0,
        people: ((j['people'] as List?) ?? [])
            .map((e) => ReferredPerson.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
      );
}

/// Un día de la tira de racha.
class ProgressDay {
  final DateTime date;
  final bool     hasTrip;
  final bool     isToday;

  ProgressDay({required this.date, required this.hasTrip, required this.isToday});

  factory ProgressDay.fromJson(Map<String, dynamic> j) => ProgressDay(
        date:    _date(j['date']) ?? DateTime.now(),
        hasTrip: j['hasTrip'] == true,
        isToday: j['isToday'] == true,
      );
}

/// Logros EN CURSO: lo que falta, no lo ya ganado.
class Progress {
  final int  streakDays;
  final int  streakTarget;
  final int  streakPoints;
  final int  streakDaysToGo;
  final bool traveledToday;
  final List<ProgressDay> days;

  final int  weeklyTrips;
  /// 0 significa que la meta semanal no aplica a este tipo de cuenta.
  final int  weeklyGoal;
  final int  weeklyPoints;

  final bool      isAnniversaryMonth;
  final double    anniversaryMultiplier;
  final DateTime? memberSince;

  Progress({
    required this.streakDays,
    required this.streakTarget,
    required this.streakPoints,
    required this.streakDaysToGo,
    required this.traveledToday,
    required this.days,
    required this.weeklyTrips,
    required this.weeklyGoal,
    required this.weeklyPoints,
    required this.isAnniversaryMonth,
    required this.anniversaryMultiplier,
    this.memberSince,
  });

  factory Progress.fromJson(Map<String, dynamic> j) => Progress(
        streakDays:     (j['streakDays']     as num?)?.toInt() ?? 0,
        streakTarget:   (j['streakTarget']   as num?)?.toInt() ?? 0,
        streakPoints:   (j['streakPoints']   as num?)?.toInt() ?? 0,
        streakDaysToGo: (j['streakDaysToGo'] as num?)?.toInt() ?? 0,
        traveledToday:  j['traveledToday'] == true,
        days: ((j['days'] as List?) ?? [])
            .map((e) => ProgressDay.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
        weeklyTrips:  (j['weeklyTrips']  as num?)?.toInt() ?? 0,
        weeklyGoal:   (j['weeklyGoal']   as num?)?.toInt() ?? 0,
        weeklyPoints: (j['weeklyPoints'] as num?)?.toInt() ?? 0,
        isAnniversaryMonth:    j['isAnniversaryMonth'] == true,
        anniversaryMultiplier: (j['anniversaryMultiplier'] as num?)?.toDouble() ?? 1,
        memberSince:           _date(j['memberSince']),
      );

  /// true si no hay nada que mostrar: ni racha, ni meta, ni aniversario.
  bool get isEmpty =>
      streakTarget <= 0 && weeklyGoal <= 0 && !isAnniversaryMonth;
}

/// Una posición del ranking entre amigos.
class RankingEntry {
  final int    position;
  final String userId;
  final String fullName;
  final String level;
  final int    pointsThisMonth;
  final int    trips;
  final bool   isMe;
  final String relation;

  RankingEntry({
    required this.position,
    required this.userId,
    required this.fullName,
    required this.level,
    required this.pointsThisMonth,
    required this.trips,
    required this.isMe,
    required this.relation,
  });

  factory RankingEntry.fromJson(Map<String, dynamic> j) => RankingEntry(
        position:        (j['position'] as num?)?.toInt() ?? 0,
        userId:          j['userId'].toString(),
        fullName:        (j['fullName'] ?? 'Usuario').toString(),
        level:           (j['level'] ?? 'bronze').toString(),
        pointsThisMonth: (j['pointsThisMonth'] as num?)?.toInt() ?? 0,
        trips:           (j['trips'] as num?)?.toInt() ?? 0,
        isMe:            j['isMe'] == true,
        relation:        (j['relation'] ?? '').toString(),
      );
}

class FriendsRanking {
  final int    myPosition;
  final int    myPointsThisMonth;
  final String monthLabel;
  final List<RankingEntry> entries;

  FriendsRanking({
    required this.myPosition,
    required this.myPointsThisMonth,
    required this.monthLabel,
    required this.entries,
  });

  factory FriendsRanking.fromJson(Map<String, dynamic> j) => FriendsRanking(
        myPosition:        (j['myPosition']        as num?)?.toInt() ?? 0,
        myPointsThisMonth: (j['myPointsThisMonth'] as num?)?.toInt() ?? 0,
        monthLabel:        (j['monthLabel'] ?? '').toString(),
        entries: ((j['entries'] as List?) ?? [])
            .map((e) => RankingEntry.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
      );
}

/// Página de resultados del backend.
class RewardsPage<T> {
  final List<T> items;
  final int     total;
  final int     page;
  final int     pageSize;

  RewardsPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  bool get hasMore => items.length < total;
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}
