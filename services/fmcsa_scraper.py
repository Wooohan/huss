import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.fmcsa_records import Fmcsa_records
from services.fmcsa_records import Fmcsa_recordsService
from services.fmcsa_scraper import scrape_fmcsa_register, fetch_available_dates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/fmcsa", tags=["fmcsa_scraper"])


class ScrapeRequest(BaseModel):
    pd_date: str  # e.g. "20-FEB-26"


class ScrapeResponse(BaseModel):
    message: str
    records_count: int
    date: str


class DateItem(BaseModel):
    fmcsa_date: str
    label: str


class AvailableDatesResponse(BaseModel):
    dates: List[DateItem]


class StoredDatesResponse(BaseModel):
    dates: List[str]


class RecordResponse(BaseModel):
    id: int
    docket_number: str
    carrier_info: str
    published_date: Optional[str] = None
    category: str
    scrape_date: Optional[str] = None
    register_date: Optional[str] = None

    class Config:
        from_attributes = True


class RecordsListResponse(BaseModel):
    items: List[RecordResponse]
    total: int
    categories: List[str]


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_fmcsa_data(
    data: ScrapeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Scrape FMCSA Register data for a specific date and save to database."""
    logger.info(f"Scrape request for date: {data.pd_date}")

    try:
        # Check if we already have data for this date
        existing = await db.execute(
            select(func.count(Fmcsa_records.id)).where(
                Fmcsa_records.register_date == data.pd_date
            )
        )
        existing_count = existing.scalar()

        if existing_count and existing_count > 0:
            # Delete existing records for this date to refresh
            result = await db.execute(
                select(Fmcsa_records).where(
                    Fmcsa_records.register_date == data.pd_date
                )
            )
            old_records = result.scalars().all()
            for rec in old_records:
                await db.delete(rec)
            await db.commit()
            logger.info(f"Deleted {existing_count} existing records for {data.pd_date}")

        # Scrape fresh data
        records = scrape_fmcsa_register(data.pd_date)

        if not records:
            return ScrapeResponse(
                message=f"No records found for date {data.pd_date}. The register may not be published yet for this date.",
                records_count=0,
                date=data.pd_date,
            )

        # Save to database
        service = Fmcsa_recordsService(db)
        saved_count = 0
        for record_data in records:
            try:
                await service.create(record_data)
                saved_count += 1
            except Exception as e:
                logger.error(f"Error saving record: {e}")
                continue

        return ScrapeResponse(
            message=f"Successfully scraped and saved {saved_count} records for {data.pd_date}",
            records_count=saved_count,
            date=data.pd_date,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Scrape error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Scrape failed: {str(e)}")


@router.get("/dates", response_model=AvailableDatesResponse)
async def get_available_dates():
    """Get list of available FMCSA register dates from the FMCSA website."""
    try:
        dates = fetch_available_dates()
        return AvailableDatesResponse(
            dates=[DateItem(**d) for d in dates]
        )
    except Exception as e:
        logger.error(f"Error fetching dates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch dates: {str(e)}")


@router.get("/stored-dates", response_model=StoredDatesResponse)
async def get_stored_dates(
    db: AsyncSession = Depends(get_db),
):
    """Get list of dates that have already been scraped and stored in the database."""
    try:
        result = await db.execute(
            select(distinct(Fmcsa_records.register_date))
            .where(Fmcsa_records.register_date.isnot(None))
            .order_by(Fmcsa_records.register_date.desc())
        )
        dates = [row[0] for row in result.fetchall() if row[0]]
        return StoredDatesResponse(dates=dates)
    except Exception as e:
        logger.error(f"Error fetching stored dates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/records", response_model=RecordsListResponse)
async def get_fmcsa_records(
    register_date: Optional[str] = Query(None, description="Filter by register date"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in docket number or carrier info"),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    """Get FMCSA records with optional filters."""
    try:
        query = select(Fmcsa_records)
        count_query = select(func.count(Fmcsa_records.id))

        if register_date:
            query = query.where(Fmcsa_records.register_date == register_date)
            count_query = count_query.where(Fmcsa_records.register_date == register_date)

        if category:
            query = query.where(Fmcsa_records.category == category)
            count_query = count_query.where(Fmcsa_records.category == category)

        if search:
            search_filter = (
                Fmcsa_records.docket_number.ilike(f"%{search}%")
                | Fmcsa_records.carrier_info.ilike(f"%{search}%")
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        # Get total count
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        # Get categories for the current filter
        cat_query = select(distinct(Fmcsa_records.category))
        if register_date:
            cat_query = cat_query.where(Fmcsa_records.register_date == register_date)
        cat_result = await db.execute(cat_query)
        categories = [row[0] for row in cat_result.fetchall() if row[0]]

        # Get records
        query = query.order_by(Fmcsa_records.id).offset(skip).limit(limit)
        result = await db.execute(query)
        items = result.scalars().all()

        return RecordsListResponse(
            items=items,
            total=total,
            categories=sorted(categories),
        )

    except Exception as e:
        logger.error(f"Error fetching records: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
